SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

CREATE EXTENSION pg_cardano;

--
-- Wrapping original cardano.blake2b_hash to make it IMMUTABLE that is required to create the `tx_metadata_vote_stake_pub` index
--
CREATE OR REPLACE FUNCTION public.blake2b_hash(input bytea, output_length integer)
 RETURNS bytea
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
  BEGIN
    RETURN cardano.blake2b_hash(input, output_length);
  END;
$function$;

--
-- Wrapping original cardano.ed25519_verify_signature to catch exceptions when the key length is <> 32
--
CREATE OR REPLACE FUNCTION public.ed25519_verify_signature(public_key_bytes bytea, message bytea, signature_bytes bytea)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
  BEGIN
    RETURN cardano.ed25519_verify_signature(public_key_bytes, message, signature_bytes);
  EXCEPTION
    WHEN OTHERS THEN RETURN NULL;
  END;
$function$;

CREATE OR REPLACE FUNCTION public.convert_asset_name(name bytea)
 RETURNS character varying
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
  BEGIN
    RETURN convert_from(name, 'utf-8');
  EXCEPTION
    WHEN OTHERS THEN RETURN NULL;
  END;
$function$;

CREATE OR REPLACE FUNCTION public.convert_pool_meta(bytes bytea)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE STRICT
AS $function$
  BEGIN
    RETURN regexp_replace(convert_from(bytes, 'utf-8'), '[\n\r\f\u000B\u0085\u2028\u2029]+', ' ', 'g')::jsonb;
  EXCEPTION
    WHEN OTHERS THEN RETURN NULL;
  END;
$function$;

CREATE OR REPLACE FUNCTION public.json_hex_str_to_bytea(hex_str text) 
 RETURNS bytea 
 LANGUAGE sql 
 IMMUTABLE STRICT 
AS $function$
  SELECT CASE 
    WHEN length(hex_str) % 2 = 0 AND substring(hex_str from 3) ~ '^[0-9a-fA-F]*$'
      THEN decode(substring(hex_str, 3), 'hex')
    ELSE NULL 
  END;
$function$;

CREATE OR REPLACE FUNCTION public.on_block_after()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
  BEGIN
    IF (TG_OP = 'DELETE') THEN
      INSERT INTO adastat_block_orphan
      VALUES(OLD.hash, OLD.epoch_no, OLD.slot_no, OLD.block_no, OLD.slot_leader_id, OLD.size, OLD.time, OLD.tx_count, OLD.epoch_slot_no, OLD.vrf_key)
      ON CONFLICT (hash, block_no, slot_leader_id) DO NOTHING;
      RETURN OLD;
    ELSIF (TG_OP = 'INSERT') THEN
      PERFORM pg_notify('insert_block_event', json_build_object('block_no', NEW.block_no, 'block_hash', encode(NEW.hash, 'hex'), 'epoch_no', NEW.epoch_no, 'slot_no', NEW.slot_no, 'epoch_slot_no', NEW.epoch_slot_no, 'block_size', NEW.size, 'tx_count', NEW.tx_count, 'slot_leader_id', NEW.slot_leader_id)::text);
      RETURN NEW;
    END IF;
    RETURN NULL;
  END;
$function$;

CREATE INDEX tx_metadata_catalyst ON public.tx_metadata USING btree (blake2b_hash(json_hex_str_to_bytea(substring(json->>'2', 1, 66)), 28)) WHERE key = 61284;
CREATE INDEX tx_metadata_calidus ON public.tx_metadata USING btree ((json->'1'->'1'->>1)) WHERE key = 867;
CREATE INDEX tx_metadata_key ON public.tx_metadata USING btree (key);
CREATE INDEX multi_asset_name_lcc ON public.multi_asset (lower(encode(name, 'escape')) COLLATE "C");
CREATE INDEX multi_asset_fingerprint ON public.multi_asset USING btree (fingerprint);
CREATE INDEX tx_out_sum ON public.tx USING btree (out_sum);
CREATE INDEX tx_fee ON public.tx USING btree (fee);
CREATE INDEX tx_deposit ON public.tx USING btree (deposit);
CREATE INDEX tx_size ON public.tx USING btree (size);
CREATE INDEX tx_script_size ON public.tx USING btree (script_size);
CREATE INDEX block_tx_count ON public.block USING btree (tx_count);
CREATE INDEX block_size ON public.block USING btree (size);
CREATE INDEX delegation_vote_addr_id_idx ON public.delegation_vote USING btree (addr_id);
CREATE INDEX delegation_vote_drep_hash_id_idx ON public.delegation_vote USING btree (drep_hash_id);
CREATE INDEX delegation_vote_redeemer_id_idx ON public.delegation_vote USING btree (redeemer_id);
CREATE INDEX delegation_vote_tx_id_idx ON public.delegation_vote USING btree (tx_id);
CREATE INDEX drep_registration_drep_hash_id_idx ON public.drep_registration USING btree (drep_hash_id);
CREATE INDEX drep_registration_tx_id_idx ON public.drep_registration USING btree (tx_id);
CREATE INDEX gov_action_proposal_tx_id_idx ON public.gov_action_proposal USING btree (tx_id);
CREATE INDEX idx_epoch_stake_epoch_no ON public.epoch_stake USING btree (epoch_no);
CREATE INDEX idx_pool_relay_update_id ON public.pool_relay USING btree (update_id);
CREATE INDEX idx_pool_retire_announced_tx_id ON public.pool_retire USING btree (announced_tx_id);
CREATE INDEX idx_pool_update_registered_tx_id ON public.pool_update USING btree (registered_tx_id);
CREATE INDEX idx_reserve_addr_id ON public.reserve USING btree (addr_id);
CREATE INDEX idx_reward_addr_id ON public.reward USING btree (addr_id);
CREATE INDEX idx_stake_deregistration_tx_id ON public.stake_deregistration USING btree (tx_id);
CREATE INDEX idx_stake_registration_tx_id ON public.stake_registration USING btree (tx_id);
CREATE INDEX idx_treasury_addr_id ON public.treasury USING btree (addr_id);
CREATE INDEX idx_tx_in_tx_in_id ON public.tx_in USING btree (tx_in_id);
CREATE INDEX idx_tx_in_tx_out_id ON public.tx_in USING btree (tx_out_id);
CREATE INDEX idx_tx_out_address ON public.tx_out USING btree (md5((address)::text));
CREATE INDEX idx_tx_out_tx_id ON public.tx_out USING btree (tx_id);
CREATE INDEX idx_withdrawal_addr_id ON public.withdrawal USING btree (addr_id);
CREATE INDEX ma_tx_mint_ident ON public.ma_tx_mint USING btree (ident);
CREATE INDEX ma_tx_out_ident_idx ON public.ma_tx_out USING btree (ident);
CREATE INDEX redeemer_tx_id_idx ON public.redeemer USING btree (tx_id);
CREATE INDEX reward_rest_addr_id_idx ON public.reward_rest USING btree (addr_id);
CREATE INDEX reward_rest_earned_epoch_idx ON public.reward_rest USING btree (earned_epoch);
CREATE INDEX reward_rest_spendable_epoch_idx ON public.reward_rest USING btree (spendable_epoch);
CREATE INDEX voting_procedure_gov_action_proposal_id_idx ON public.voting_procedure USING btree (gov_action_proposal_id);
CREATE INDEX voting_procedure_tx_id_idx ON public.voting_procedure USING btree (tx_id);


CREATE TRIGGER block_trigger
AFTER INSERT OR DELETE
ON block
FOR EACH ROW EXECUTE FUNCTION on_block_after();
