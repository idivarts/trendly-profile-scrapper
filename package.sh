

#!/bin/bash

# Create packages folder if it doesn't exist
mkdir -p packages

# Get current directory name
dir_name=$(basename "$PWD")

# Create a timestamp for uniqueness
timestamp=$(date +"%Y%m%d_%H%M%S")

# Define output zip file path
zip_file="packages/${dir_name}_${timestamp}.zip"

# Zip only files in the current directory (exclude folders)
zip -j "$zip_file" ./*

echo "Packaged files into $zip_file"