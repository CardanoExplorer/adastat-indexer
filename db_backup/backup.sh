#!/usr/bin/bash

show_usage () {
	echo "Usage:"
  echo
	echo "    PGPASSFILE=/path/to/.pgpass $0 backup_name             - Backup ${db} database to backup_name"
  echo
}

show_success () {
	echo
	echo "Done"
	echo
}

if test ! -f "${PGPASSFILE}" ; then
	echo "Error:"
	echo
	echo "    PostgreSQL password file ${PGPASSFILE} does not exist."
  echo
	show_usage
	exit 1
fi

db=$(cut -d ":" -f 3 "${PGPASSFILE}")

if [ -z "$1" ]; then
	show_usage
  exit 1
fi

filename=$1

if [[ $filename != *".pgsql.gz" ]]; then
	filename+=".pgsql.gz"
fi

echo "Backing up ${db} to ${filename}..."

pg_dump -c -Fc -t 'adastat_*' -T 'adastat_block_orphan' -d $db -f $filename && show_success
