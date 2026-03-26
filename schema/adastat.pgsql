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

DROP INDEX public.adastat_utxo_tx_out_id;
DROP INDEX public.adastat_utxo_address_id_tx_out_id;
DROP INDEX public.adastat_tx_type;
DROP INDEX public.adastat_tx_token;
DROP INDEX public.adastat_tx_amount;
DROP INDEX public.adastat_tx_address_address_id_tx_id;
DROP INDEX public.adastat_tx_address_account_id_tx_id;
DROP INDEX public.adastat_stake_deregistration_from_pool;
DROP INDEX public.adastat_pool_update_id;
DROP INDEX public.adastat_pool_ticker;
DROP INDEX public.adastat_pool_stake_amount;
DROP INDEX public.adastat_pool_retirement_id;
DROP INDEX public.adastat_pool_registration_id;
DROP INDEX public.adastat_pool_pool_reward;
DROP INDEX public.adastat_pool_name;
DROP INDEX public.adastat_pool_itn_owner;
DROP INDEX public.adastat_pool_homepage;
DROP INDEX public.adastat_pool_delegator_reward;
DROP INDEX public.adastat_pool_cluster_ticker;
DROP INDEX public.adastat_pool_cluster_name;
DROP INDEX public.adastat_pool_block_count;
DROP INDEX public.adastat_pool_active_epoch;
DROP INDEX public.adastat_multi_asset_tx;
DROP INDEX public.adastat_multi_asset_supply;
DROP INDEX public.adastat_multi_asset_policy_id;
DROP INDEX public.adastat_multi_asset_last_tx;
DROP INDEX public.adastat_multi_asset_holder;
DROP INDEX public.adastat_multi_asset_first_tx;
DROP INDEX public.adastat_ma_policy_tx;
DROP INDEX public.adastat_ma_policy_token;
DROP INDEX public.adastat_ma_policy_policy;
DROP INDEX public.adastat_ma_policy_last_tx;
DROP INDEX public.adastat_ma_policy_holder;
DROP INDEX public.adastat_ma_policy_first_tx;
DROP INDEX public.adastat_ma_holder_quantity;
DROP INDEX public.adastat_ma_holder_policy_id_quantity;
DROP INDEX public.adastat_ma_holder_ma_id_quantity;
DROP INDEX public.adastat_ma_holder_holder_id_ma_id;
DROP INDEX public.adastat_ma_holder_account_id;
DROP INDEX public.adastat_epoch_pool_pool_id;
DROP INDEX public.adastat_epoch_pool_epoch_no_pool_id;
DROP INDEX public.adastat_delegation_from_pool;
DROP INDEX public.adastat_block_tx_out_sum;
DROP INDEX public.adastat_block_tx_fee;
DROP INDEX public.adastat_block_tx_amount;
DROP INDEX public.adastat_block_orphan_slot_no;
DROP INDEX public.adastat_block_orphan_slot_leader;
DROP INDEX public.adastat_block_orphan_block_no;
DROP INDEX public.adastat_address_tx;
DROP INDEX public.adastat_address_token;
DROP INDEX public.adastat_address_last_tx;
DROP INDEX public.adastat_address_first_tx;
DROP INDEX public.adastat_address_byron_tx;
DROP INDEX public.adastat_address_byron_token;
DROP INDEX public.adastat_address_byron_last_tx;
DROP INDEX public.adastat_address_byron_first_tx;
DROP INDEX public.adastat_address_byron_amount;
DROP INDEX public.adastat_address_byron_address;
DROP INDEX public.adastat_address_amount;
DROP INDEX public.adastat_address_address;
DROP INDEX public.adastat_address_account_id;
DROP INDEX public.adastat_account_tx;
DROP INDEX public.adastat_account_total_reward;
DROP INDEX public.adastat_account_token;
DROP INDEX public.adastat_account_reward;
DROP INDEX public.adastat_account_retired_pool;
DROP INDEX public.adastat_account_pool;
DROP INDEX public.adastat_account_last_tx;
DROP INDEX public.adastat_account_first_tx;
DROP INDEX public.adastat_account_amount;
ALTER TABLE ONLY public.adastat_tx DROP CONSTRAINT adastat_tx_pkey;
ALTER TABLE ONLY public.adastat_stake_deregistration DROP CONSTRAINT adastat_stake_deregistration_pkey;
ALTER TABLE ONLY public.adastat_pool DROP CONSTRAINT adastat_pool_pkey;
ALTER TABLE ONLY public.adastat_pool_migrate DROP CONSTRAINT adastat_pool_migrate_hash;
ALTER TABLE ONLY public.adastat_pool_itn DROP CONSTRAINT adastat_pool_itn_ticker;
ALTER TABLE ONLY public.adastat_pool_cluster DROP CONSTRAINT adastat_pool_cluster_id;
ALTER TABLE ONLY public.adastat_pool_assigned_block DROP CONSTRAINT adastat_pool_assigned_block_epoch_id_pool_id;
ALTER TABLE ONLY public.adastat_multi_asset DROP CONSTRAINT adastat_multi_asset_pkey;
ALTER TABLE ONLY public.adastat_ma_policy DROP CONSTRAINT adastat_ma_policy_pkey;
ALTER TABLE ONLY public.adastat_epoch DROP CONSTRAINT adastat_epoch_id;
ALTER TABLE ONLY public.adastat_delegation DROP CONSTRAINT adastat_delegation_pkey;
ALTER TABLE ONLY public.adastat_currency_price DROP CONSTRAINT adastat_currency_price_currency;
ALTER TABLE ONLY public.adastat_price_history DROP CONSTRAINT adastat_currency_history_date;
ALTER TABLE ONLY public.adastat_block DROP CONSTRAINT adastat_block_pkey;
ALTER TABLE ONLY public.adastat_block_orphan DROP CONSTRAINT adastat_block_orphan_hash_block_no_slot_leader;
ALTER TABLE ONLY public.adastat_address DROP CONSTRAINT adastat_address_pkey;
ALTER TABLE ONLY public.adastat_address_byron DROP CONSTRAINT adastat_address_byron_pkey;
ALTER TABLE ONLY public.adastat_account_voting_registration DROP CONSTRAINT adastat_account_voting_registration_account_id_tx_id;
ALTER TABLE ONLY public.adastat_account DROP CONSTRAINT adastat_account_pkey;
ALTER TABLE public.adastat_pool_cluster ALTER COLUMN id DROP DEFAULT;
ALTER TABLE public.adastat_ma_policy ALTER COLUMN id DROP DEFAULT;
ALTER TABLE public.adastat_address_byron ALTER COLUMN id DROP DEFAULT;
ALTER TABLE public.adastat_address ALTER COLUMN id DROP DEFAULT;
DROP TABLE public.adastat_utxo;
DROP TABLE public.adastat_tx_address;
DROP TABLE public.adastat_tx;
DROP TABLE public.adastat_stake_deregistration;
DROP TABLE public.adastat_price_history;
DROP TABLE public.adastat_pool_migrate;
DROP TABLE public.adastat_pool_itn;
DROP SEQUENCE public.adastat_pool_cluster_id_seq;
DROP TABLE public.adastat_pool_cluster;
DROP TABLE public.adastat_pool_assigned_block;
DROP TABLE public.adastat_pool;
DROP TABLE public.adastat_multi_asset;
DROP SEQUENCE public.adastat_ma_policy_id_seq;
DROP TABLE public.adastat_ma_policy;
DROP TABLE public.adastat_ma_holder;
DROP TABLE public.adastat_epoch_pool;
DROP TABLE public.adastat_epoch;
DROP TABLE public.adastat_delegation;
DROP TABLE public.adastat_currency_price;
DROP TABLE public.adastat_block_orphan;
DROP TABLE public.adastat_block;
DROP SEQUENCE public.adastat_address_id_seq;
DROP SEQUENCE public.adastat_address_byron_id_seq;
DROP TABLE public.adastat_address_byron;
DROP TABLE public.adastat_address;
DROP TABLE public.adastat_account_voting_registration;
DROP TABLE public.adastat_account;
SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: adastat_account; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.adastat_account (
    id bigint NOT NULL,
    amount bigint DEFAULT '0'::bigint NOT NULL,
    reward bigint DEFAULT '0'::bigint NOT NULL,
    pool bigint,
    total_reward bigint DEFAULT '0'::bigint NOT NULL,
    retired_pool bigint,
    first_tx bigint,
    last_tx bigint,
    tx integer DEFAULT 0 NOT NULL,
    possible_reward bigint,
    token integer DEFAULT 0 NOT NULL,
    snapshot_amount bigint DEFAULT '0'::bigint NOT NULL,
    snapshot_pool bigint,
    active_amount bigint DEFAULT '0'::bigint NOT NULL,
    active_pool bigint
);


--
-- Name: adastat_account_voting_registration; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.adastat_account_voting_registration (
    account_id bigint NOT NULL,
    tx_id bigint NOT NULL
);


--
-- Name: adastat_address; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.adastat_address (
    id bigint NOT NULL,
    address character varying NOT NULL,
    account_id bigint,
    amount bigint DEFAULT '0'::bigint NOT NULL,
    first_tx bigint,
    last_tx bigint,
    tx integer DEFAULT 0 NOT NULL,
    token integer DEFAULT 0 NOT NULL
);


--
-- Name: adastat_address_byron; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.adastat_address_byron (
    id bigint NOT NULL,
    address character varying NOT NULL,
    amount bigint DEFAULT '0'::bigint NOT NULL,
    first_tx bigint,
    last_tx bigint,
    tx integer DEFAULT 0 NOT NULL,
    token integer DEFAULT 0 NOT NULL
);


--
-- Name: adastat_address_byron_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.adastat_address_byron_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: adastat_address_byron_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.adastat_address_byron_id_seq OWNED BY public.adastat_address_byron.id;


--
-- Name: adastat_address_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.adastat_address_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: adastat_address_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.adastat_address_id_seq OWNED BY public.adastat_address.id;


--
-- Name: adastat_block; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.adastat_block (
    id bigint NOT NULL,
    tx_amount bigint DEFAULT '0'::bigint NOT NULL,
    tx_fee bigint DEFAULT '0'::bigint NOT NULL,
    tx_out_sum bigint DEFAULT '0'::bigint NOT NULL
);


--
-- Name: adastat_block_orphan; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.adastat_block_orphan (
    hash bytea NOT NULL,
    epoch_no integer,
    slot_no integer,
    block_no integer,
    slot_leader_id bigint NOT NULL,
    size integer NOT NULL,
    "time" timestamp without time zone NOT NULL,
    tx_count bigint NOT NULL,
    epoch_slot_no integer,
    vrf_key character varying
);


--
-- Name: adastat_currency_price; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.adastat_currency_price (
    currency character varying NOT NULL,
    price double precision NOT NULL
);


--
-- Name: adastat_delegation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.adastat_delegation (
    id bigint NOT NULL,
    from_pool bigint,
    amount bigint DEFAULT '0'::bigint NOT NULL
);


--
-- Name: adastat_epoch; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.adastat_epoch (
    no integer NOT NULL,
    tx_amount numeric DEFAULT '0'::numeric NOT NULL,
    circulating_supply bigint DEFAULT '0'::bigint NOT NULL,
    pool integer DEFAULT 0 NOT NULL,
    pool_with_block integer DEFAULT 0 NOT NULL,
    pool_with_stake integer DEFAULT 0 NOT NULL,
    pool_reward bigint,
    delegator_reward bigint,
    stake bigint DEFAULT '0'::bigint NOT NULL,
    delegator bigint DEFAULT '0'::bigint NOT NULL,
    account bigint DEFAULT '0'::bigint NOT NULL,
    reward bigint,
    pool_register integer DEFAULT 0 NOT NULL,
    pool_retire integer DEFAULT 0 NOT NULL,
    orphaned_reward bigint,
    block_with_tx integer DEFAULT 0 NOT NULL,
    byron bigint DEFAULT '0'::bigint NOT NULL,
    byron_with_amount bigint DEFAULT '0'::bigint NOT NULL,
    byron_amount bigint DEFAULT '0'::bigint NOT NULL,
    account_with_stake bigint DEFAULT '0'::bigint NOT NULL,
    delegator_with_stake bigint DEFAULT '0'::bigint NOT NULL,
    token bigint DEFAULT '0'::bigint NOT NULL,
    token_policy bigint DEFAULT '0'::bigint NOT NULL,
    token_holder bigint DEFAULT '0'::bigint NOT NULL,
    token_tx integer DEFAULT 0 NOT NULL,
    blockchain_size bigint DEFAULT '0'::bigint NOT NULL,
    holder_range jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: adastat_epoch_pool; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.adastat_epoch_pool (
    epoch_no integer NOT NULL,
    pool_id bigint NOT NULL,
    block smallint DEFAULT '0'::smallint NOT NULL,
    assigned_block smallint DEFAULT '-1'::smallint NOT NULL,
    stake bigint DEFAULT '0'::bigint NOT NULL,
    delegator bigint DEFAULT '0'::bigint NOT NULL,
    pool_reward bigint DEFAULT '0'::bigint NOT NULL,
    delegator_reward bigint DEFAULT '0'::bigint NOT NULL,
    update_id bigint,
    real_pledge bigint DEFAULT '0'::bigint NOT NULL,
    ros real DEFAULT '-1'::real NOT NULL,
    orphaned_reward bigint DEFAULT '0'::bigint NOT NULL,
    delegator_with_stake bigint DEFAULT '0'::bigint NOT NULL
);


--
-- Name: adastat_ma_holder; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.adastat_ma_holder (
    ma_id bigint NOT NULL,
    holder_id bigint NOT NULL,
    quantity numeric DEFAULT '0'::numeric NOT NULL,
    policy_id bigint NOT NULL,
    account_id bigint
);


--
-- Name: adastat_ma_policy; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.adastat_ma_policy (
    id bigint NOT NULL,
    policy bytea NOT NULL,
    token bigint DEFAULT '0'::bigint NOT NULL,
    holder bigint DEFAULT '0'::bigint NOT NULL,
    first_tx bigint,
    last_tx bigint,
    tx bigint DEFAULT '0'::bigint NOT NULL
);


--
-- Name: adastat_ma_policy_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.adastat_ma_policy_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: adastat_ma_policy_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.adastat_ma_policy_id_seq OWNED BY public.adastat_ma_policy.id;


--
-- Name: adastat_multi_asset; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.adastat_multi_asset (
    id bigint NOT NULL,
    supply numeric DEFAULT '0'::numeric NOT NULL,
    holder bigint DEFAULT '0'::bigint NOT NULL,
    first_tx bigint,
    last_tx bigint,
    tx integer DEFAULT 0 NOT NULL,
    meta_id bigint,
    policy_id bigint DEFAULT '0'::bigint NOT NULL
);


--
-- Name: adastat_pool; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.adastat_pool (
    id bigint NOT NULL,
    name character varying DEFAULT ''::character varying NOT NULL,
    ticker character varying DEFAULT ''::character varying NOT NULL,
    description character varying DEFAULT ''::character varying NOT NULL,
    homepage character varying DEFAULT ''::character varying NOT NULL,
    extended character varying DEFAULT ''::character varying NOT NULL,
    extended_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    registration_id bigint,
    update_id bigint,
    retirement_id bigint,
    pool_reward bigint DEFAULT '0'::bigint NOT NULL,
    delegator_reward bigint DEFAULT '0'::bigint NOT NULL,
    epoch_with_block integer DEFAULT 0 NOT NULL,
    valid_meta_hash smallint DEFAULT '0'::smallint NOT NULL,
    block integer DEFAULT 0 NOT NULL,
    cluster_id bigint,
    itn_ticker smallint DEFAULT '0'::smallint NOT NULL,
    impersonator smallint DEFAULT '0'::smallint NOT NULL,
    bot_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    orphaned_reward bigint DEFAULT '0'::bigint NOT NULL,
    possible_reward bigint,
    update_block integer DEFAULT 0 NOT NULL
);


--
-- Name: adastat_pool_assigned_block; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.adastat_pool_assigned_block (
    epoch_id bigint NOT NULL,
    pool_id bigint NOT NULL,
    block smallint DEFAULT '0'::smallint NOT NULL
);


--
-- Name: adastat_pool_cluster; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.adastat_pool_cluster (
    id integer NOT NULL,
    name character varying NOT NULL,
    ticker character varying NOT NULL,
    description character varying NOT NULL,
    homepage character varying NOT NULL
);


--
-- Name: adastat_pool_cluster_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.adastat_pool_cluster_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: adastat_pool_cluster_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.adastat_pool_cluster_id_seq OWNED BY public.adastat_pool_cluster.id;


--
-- Name: adastat_pool_itn; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.adastat_pool_itn (
    owner character varying NOT NULL,
    ticker character varying CONSTRAINT adastat_pool_itn_ticker_not_null1 NOT NULL
);


--
-- Name: adastat_pool_migrate; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.adastat_pool_migrate (
    hash bytea NOT NULL,
    name character varying DEFAULT ''::character varying NOT NULL,
    ticker character varying DEFAULT ''::character varying NOT NULL,
    description character varying DEFAULT ''::character varying NOT NULL,
    homepage character varying DEFAULT ''::character varying NOT NULL,
    extended character varying DEFAULT ''::character varying NOT NULL,
    extended_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    valid_meta_hash smallint DEFAULT '0'::smallint NOT NULL,
    itn_ticker smallint DEFAULT '0'::smallint NOT NULL,
    impersonator smallint DEFAULT '0'::smallint NOT NULL,
    bot_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    cluster_id integer
);


--
-- Name: adastat_price_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.adastat_price_history (
    date date NOT NULL,
    prices jsonb NOT NULL
);


--
-- Name: adastat_stake_deregistration; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.adastat_stake_deregistration (
    id bigint NOT NULL,
    from_pool bigint,
    amount bigint DEFAULT '0'::bigint NOT NULL
);


--
-- Name: adastat_tx; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.adastat_tx (
    id bigint NOT NULL,
    type smallint DEFAULT 0 NOT NULL,
    amount bigint DEFAULT '0'::bigint NOT NULL,
    token smallint DEFAULT '0'::smallint NOT NULL
);


--
-- Name: adastat_tx_address; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.adastat_tx_address (
    tx_id bigint NOT NULL,
    address_id bigint NOT NULL,
    account_id bigint
);


--
-- Name: adastat_utxo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.adastat_utxo (
    address_id bigint NOT NULL,
    tx_out_id bigint NOT NULL
);


--
-- Name: adastat_address id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adastat_address ALTER COLUMN id SET DEFAULT nextval('public.adastat_address_id_seq'::regclass);


--
-- Name: adastat_address_byron id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adastat_address_byron ALTER COLUMN id SET DEFAULT nextval('public.adastat_address_byron_id_seq'::regclass);


--
-- Name: adastat_ma_policy id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adastat_ma_policy ALTER COLUMN id SET DEFAULT nextval('public.adastat_ma_policy_id_seq'::regclass);


--
-- Name: adastat_pool_cluster id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adastat_pool_cluster ALTER COLUMN id SET DEFAULT nextval('public.adastat_pool_cluster_id_seq'::regclass);


--
-- Name: adastat_account adastat_account_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adastat_account
    ADD CONSTRAINT adastat_account_pkey PRIMARY KEY (id);


--
-- Name: adastat_account_voting_registration adastat_account_voting_registration_account_id_tx_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adastat_account_voting_registration
    ADD CONSTRAINT adastat_account_voting_registration_account_id_tx_id UNIQUE (account_id, tx_id);


--
-- Name: adastat_address_byron adastat_address_byron_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adastat_address_byron
    ADD CONSTRAINT adastat_address_byron_pkey PRIMARY KEY (id);


--
-- Name: adastat_address adastat_address_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adastat_address
    ADD CONSTRAINT adastat_address_pkey PRIMARY KEY (id);


--
-- Name: adastat_block_orphan adastat_block_orphan_hash_block_no_slot_leader; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adastat_block_orphan
    ADD CONSTRAINT adastat_block_orphan_hash_block_no_slot_leader UNIQUE (hash, block_no, slot_leader_id);


--
-- Name: adastat_block adastat_block_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adastat_block
    ADD CONSTRAINT adastat_block_pkey PRIMARY KEY (id);


--
-- Name: adastat_price_history adastat_currency_history_date; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adastat_price_history
    ADD CONSTRAINT adastat_currency_history_date PRIMARY KEY (date);


--
-- Name: adastat_currency_price adastat_currency_price_currency; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adastat_currency_price
    ADD CONSTRAINT adastat_currency_price_currency PRIMARY KEY (currency);


--
-- Name: adastat_delegation adastat_delegation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adastat_delegation
    ADD CONSTRAINT adastat_delegation_pkey PRIMARY KEY (id);


--
-- Name: adastat_epoch adastat_epoch_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adastat_epoch
    ADD CONSTRAINT adastat_epoch_id PRIMARY KEY (no);


--
-- Name: adastat_ma_policy adastat_ma_policy_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adastat_ma_policy
    ADD CONSTRAINT adastat_ma_policy_pkey PRIMARY KEY (id);


--
-- Name: adastat_multi_asset adastat_multi_asset_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adastat_multi_asset
    ADD CONSTRAINT adastat_multi_asset_pkey PRIMARY KEY (id);


--
-- Name: adastat_pool_assigned_block adastat_pool_assigned_block_epoch_id_pool_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adastat_pool_assigned_block
    ADD CONSTRAINT adastat_pool_assigned_block_epoch_id_pool_id UNIQUE (epoch_id, pool_id);


--
-- Name: adastat_pool_cluster adastat_pool_cluster_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adastat_pool_cluster
    ADD CONSTRAINT adastat_pool_cluster_id PRIMARY KEY (id);


--
-- Name: adastat_pool_itn adastat_pool_itn_ticker; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adastat_pool_itn
    ADD CONSTRAINT adastat_pool_itn_ticker UNIQUE (owner);


--
-- Name: adastat_pool_migrate adastat_pool_migrate_hash; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adastat_pool_migrate
    ADD CONSTRAINT adastat_pool_migrate_hash PRIMARY KEY (hash);


--
-- Name: adastat_pool adastat_pool_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adastat_pool
    ADD CONSTRAINT adastat_pool_pkey PRIMARY KEY (id);


--
-- Name: adastat_stake_deregistration adastat_stake_deregistration_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adastat_stake_deregistration
    ADD CONSTRAINT adastat_stake_deregistration_pkey PRIMARY KEY (id);


--
-- Name: adastat_tx adastat_tx_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adastat_tx
    ADD CONSTRAINT adastat_tx_pkey PRIMARY KEY (id);


--
-- Name: adastat_account_amount; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adastat_account_amount ON public.adastat_account USING btree (amount);


--
-- Name: adastat_account_first_tx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adastat_account_first_tx ON public.adastat_account USING btree (first_tx);


--
-- Name: adastat_account_last_tx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adastat_account_last_tx ON public.adastat_account USING btree (last_tx);


--
-- Name: adastat_account_pool; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adastat_account_pool ON public.adastat_account USING btree (pool);


--
-- Name: adastat_account_retired_pool; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adastat_account_retired_pool ON public.adastat_account USING btree (retired_pool);


--
-- Name: adastat_account_reward; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adastat_account_reward ON public.adastat_account USING btree (reward);


--
-- Name: adastat_account_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adastat_account_token ON public.adastat_account USING btree (token);


--
-- Name: adastat_account_total_reward; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adastat_account_total_reward ON public.adastat_account USING btree (total_reward);


--
-- Name: adastat_account_tx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adastat_account_tx ON public.adastat_account USING btree (tx);


--
-- Name: adastat_address_account_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adastat_address_account_id ON public.adastat_address USING btree (account_id);


--
-- Name: adastat_address_address; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adastat_address_address ON public.adastat_address USING hash (address);


--
-- Name: adastat_address_amount; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adastat_address_amount ON public.adastat_address USING btree (amount);


--
-- Name: adastat_address_byron_address; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adastat_address_byron_address ON public.adastat_address_byron USING hash (address);


--
-- Name: adastat_address_byron_amount; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adastat_address_byron_amount ON public.adastat_address_byron USING btree (amount);


--
-- Name: adastat_address_byron_first_tx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adastat_address_byron_first_tx ON public.adastat_address_byron USING btree (first_tx);


--
-- Name: adastat_address_byron_last_tx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adastat_address_byron_last_tx ON public.adastat_address_byron USING btree (last_tx);


--
-- Name: adastat_address_byron_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adastat_address_byron_token ON public.adastat_address_byron USING btree (token);


--
-- Name: adastat_address_byron_tx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adastat_address_byron_tx ON public.adastat_address_byron USING btree (tx);


--
-- Name: adastat_address_first_tx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adastat_address_first_tx ON public.adastat_address USING btree (first_tx);


--
-- Name: adastat_address_last_tx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adastat_address_last_tx ON public.adastat_address USING btree (last_tx);


--
-- Name: adastat_address_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adastat_address_token ON public.adastat_address USING btree (token);


--
-- Name: adastat_address_tx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adastat_address_tx ON public.adastat_address USING btree (tx);


--
-- Name: adastat_block_orphan_block_no; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adastat_block_orphan_block_no ON public.adastat_block_orphan USING btree (block_no);


--
-- Name: adastat_block_orphan_slot_leader; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adastat_block_orphan_slot_leader ON public.adastat_block_orphan USING btree (slot_leader_id);


--
-- Name: adastat_block_orphan_slot_no; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adastat_block_orphan_slot_no ON public.adastat_block_orphan USING btree (slot_no);


--
-- Name: adastat_block_tx_amount; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adastat_block_tx_amount ON public.adastat_block USING btree (tx_amount);


--
-- Name: adastat_block_tx_fee; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adastat_block_tx_fee ON public.adastat_block USING btree (tx_fee);


--
-- Name: adastat_block_tx_out_sum; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adastat_block_tx_out_sum ON public.adastat_block USING btree (tx_out_sum);


--
-- Name: adastat_delegation_from_pool; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adastat_delegation_from_pool ON public.adastat_delegation USING btree (from_pool);


--
-- Name: adastat_epoch_pool_epoch_no_pool_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX adastat_epoch_pool_epoch_no_pool_id ON public.adastat_epoch_pool USING btree (epoch_no, pool_id);


--
-- Name: adastat_epoch_pool_pool_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adastat_epoch_pool_pool_id ON public.adastat_epoch_pool USING btree (pool_id);


--
-- Name: adastat_ma_holder_account_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adastat_ma_holder_account_id ON public.adastat_ma_holder USING btree (account_id) WHERE (account_id IS NOT NULL);


--
-- Name: adastat_ma_holder_holder_id_ma_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX adastat_ma_holder_holder_id_ma_id ON public.adastat_ma_holder USING btree (holder_id, ma_id);


--
-- Name: adastat_ma_holder_ma_id_quantity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adastat_ma_holder_ma_id_quantity ON public.adastat_ma_holder USING btree (ma_id, quantity);


--
-- Name: adastat_ma_holder_policy_id_quantity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adastat_ma_holder_policy_id_quantity ON public.adastat_ma_holder USING btree (policy_id, quantity);


--
-- Name: adastat_ma_holder_quantity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adastat_ma_holder_quantity ON public.adastat_ma_holder USING btree (quantity);


--
-- Name: adastat_ma_policy_first_tx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adastat_ma_policy_first_tx ON public.adastat_ma_policy USING btree (first_tx);


--
-- Name: adastat_ma_policy_holder; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adastat_ma_policy_holder ON public.adastat_ma_policy USING btree (holder);


--
-- Name: adastat_ma_policy_last_tx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adastat_ma_policy_last_tx ON public.adastat_ma_policy USING btree (last_tx);


--
-- Name: adastat_ma_policy_policy; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX adastat_ma_policy_policy ON public.adastat_ma_policy USING btree (policy);


--
-- Name: adastat_ma_policy_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adastat_ma_policy_token ON public.adastat_ma_policy USING btree (token);


--
-- Name: adastat_ma_policy_tx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adastat_ma_policy_tx ON public.adastat_ma_policy USING btree (tx);


--
-- Name: adastat_multi_asset_first_tx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adastat_multi_asset_first_tx ON public.adastat_multi_asset USING btree (first_tx);


--
-- Name: adastat_multi_asset_holder; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adastat_multi_asset_holder ON public.adastat_multi_asset USING btree (holder);


--
-- Name: adastat_multi_asset_last_tx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adastat_multi_asset_last_tx ON public.adastat_multi_asset USING btree (last_tx);


--
-- Name: adastat_multi_asset_policy_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adastat_multi_asset_policy_id ON public.adastat_multi_asset USING btree (policy_id);


--
-- Name: adastat_multi_asset_supply; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adastat_multi_asset_supply ON public.adastat_multi_asset USING btree (supply);


--
-- Name: adastat_multi_asset_tx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adastat_multi_asset_tx ON public.adastat_multi_asset USING btree (tx);


--
-- Name: adastat_pool_active_epoch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adastat_pool_active_epoch ON public.adastat_pool USING btree (epoch_with_block);


--
-- Name: adastat_pool_block_count; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adastat_pool_block_count ON public.adastat_pool USING btree (block);


--
-- Name: adastat_pool_cluster_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adastat_pool_cluster_name ON public.adastat_pool_cluster USING btree (name);


--
-- Name: adastat_pool_cluster_ticker; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adastat_pool_cluster_ticker ON public.adastat_pool_cluster USING btree (ticker);


--
-- Name: adastat_pool_delegator_reward; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adastat_pool_delegator_reward ON public.adastat_pool USING btree (delegator_reward);


--
-- Name: adastat_pool_homepage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adastat_pool_homepage ON public.adastat_pool USING btree (homepage);


--
-- Name: adastat_pool_itn_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adastat_pool_itn_owner ON public.adastat_pool_itn USING btree (ticker);


--
-- Name: adastat_pool_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adastat_pool_name ON public.adastat_pool USING btree (name);


--
-- Name: adastat_pool_pool_reward; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adastat_pool_pool_reward ON public.adastat_pool USING btree (pool_reward);


--
-- Name: adastat_pool_registration_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adastat_pool_registration_id ON public.adastat_pool USING btree (registration_id);


--
-- Name: adastat_pool_retirement_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adastat_pool_retirement_id ON public.adastat_pool USING btree (retirement_id);


--
-- Name: adastat_pool_stake_amount; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adastat_pool_stake_amount ON public.adastat_pool USING btree (valid_meta_hash);


--
-- Name: adastat_pool_ticker; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adastat_pool_ticker ON public.adastat_pool USING btree (ticker);


--
-- Name: adastat_pool_update_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adastat_pool_update_id ON public.adastat_pool USING btree (update_id);


--
-- Name: adastat_stake_deregistration_from_pool; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adastat_stake_deregistration_from_pool ON public.adastat_stake_deregistration USING btree (from_pool);


--
-- Name: adastat_tx_address_account_id_tx_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adastat_tx_address_account_id_tx_id ON public.adastat_tx_address USING btree (account_id, tx_id);


--
-- Name: adastat_tx_address_address_id_tx_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX adastat_tx_address_address_id_tx_id ON public.adastat_tx_address USING btree (address_id, tx_id);


--
-- Name: adastat_tx_amount; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adastat_tx_amount ON public.adastat_tx USING btree (amount);


--
-- Name: adastat_tx_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adastat_tx_token ON public.adastat_tx USING btree (token);


--
-- Name: adastat_tx_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adastat_tx_type ON public.adastat_tx USING btree (type);


--
-- Name: adastat_utxo_address_id_tx_out_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX adastat_utxo_address_id_tx_out_id ON public.adastat_utxo USING btree (address_id, tx_out_id);


--
-- Name: adastat_utxo_tx_out_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX adastat_utxo_tx_out_id ON public.adastat_utxo USING btree (tx_out_id);

