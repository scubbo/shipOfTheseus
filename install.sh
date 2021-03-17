#!/usr/bin/env sh

while getopts o: flag
do
    case "${flag}" in
        o) oauth=${OPTARG};;
    esac
done

if [ -z ${oauth+x} ];
then
  echo "Use -o to set oauth token";
  exit
fi

if ! command -v aws &> /dev/null
then
    echo "aws cli could not be found - install from https://aws.amazon.com/cli/"
    exit
fi


echo "OAuth token is $oauth";
aws