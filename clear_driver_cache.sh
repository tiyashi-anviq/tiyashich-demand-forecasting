#!/bin/bash
# Clear stale demand driver cache entries

DB="/Users/tiyashi/Desktop/work/eveready-demand-planning-app/api/storage/graphs.sqlite"

echo "Clearing demand driver cache..."
sqlite3 "$DB" "DELETE FROM graph_payloads WHERE view='drivers' AND payload LIKE '%building%';"
sqlite3 "$DB" "DELETE FROM graph_payloads WHERE view='drivers' AND payload LIKE '%error%';"

echo "Done! Remaining driver cache entries:"
sqlite3 "$DB" "SELECT COUNT(*) FROM graph_payloads WHERE view='drivers';"
