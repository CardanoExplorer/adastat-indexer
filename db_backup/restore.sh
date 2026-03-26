#!/usr/bin/bash

show_usage () {
	echo "Usage:"
  echo
	echo "    PGPASSFILE=/path/to/.pgpass $0 backup_name             - Restore backup_name to ${db} database"
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

echo "Restoring ${db} from ${filename}..."

pg_restore -c -d $db -j 8 $filename && show_success
