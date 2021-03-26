#!/usr/bin/env bash

while getopts "p:o:d:" flag;
do
    case "${flag}" in
        p)
          profile=${OPTARG}
          ;;
        o)
          oAuthToken=${OPTARG}
          ;;
        d)
          dockerPassword=${OPTARG}
          ;;
    esac
done

# TODO - check for existence, and update instead
echo "Creating OAuth secret..."
oAuthTokenArn=$(aws --profile $profile --region us-east-1 secretsmanager create-secret --name shipOfTheseusOAuthToken --secret-string $oAuthToken --query ARN --output text)
echo "OAuth Token ARN: $oAuthTokenArn"

echo "Creating Docker Password secret..."
dockerPasswordArn=$(aws --profile $profile --region us-east-1 secretsmanager create-secret --name shipOfTheseusDockerPassword --secret-string $dockerPassword --query ARN --output text)
echo "Docker Password ARN: $oAuthTokenArn"