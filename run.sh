#!/bin/bash

CONFIG_PATH=/data/options.json

export EMAIL="$(jq --raw-output '.email' $CONFIG_PATH)"
export PASSWORD="$(jq --raw-output '.password' $CONFIG_PATH)"
export ACCOUNTNUM="$(jq --raw-output '.accountnum' $CONFIG_PATH)"

echo "Params:"
echo "EMAIL =" $EMAIL
echo "PASSWORD =" $(sed 's/^........../**********/' <<<$PASSWORD)
echo "ACCOUNTNUM =" $ACCOUNTNUM

# Start the listener and enter an endless loop
echo "Starting server!"
bun start