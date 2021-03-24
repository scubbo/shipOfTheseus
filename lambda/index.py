import json
import os
import requests

import logging
# https://stackoverflow.com/questions/37703609
log = logging.getLogger(__name__)
log.setLevel(logging.DEBUG)

import boto3


def handler(event, context):
    try:
        log.info(f'Event: {event}')
        log.info(f'Logical Resource: {context.log_stream_name}')
        if event['RequestType'] in ['Create', 'Update']:
            commit_data = _fetch_commit_history(os.environ['githubCommitsUrl'])
            s3 = boto3.resource('s3')
            bucket_name = os.environ['bucketArn'].split(':')[-1]
            object = s3.Object(bucket_name, 'commits.json')
            # TODO - do we need public ACL, or expiry?
            log.info('Uploading to S3...')
            log.info(object.put(Body=json.dumps(commit_data).encode('utf-8')))
            # TODO - pass in the commit that the pipeline's working on, and restrict this
            # to only "commits prior to that", just in case there are two commits in quick succession
        else:
            log.info('Non-create/update RequestType')

        # https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/crpg-ref-responses.html
        responseData = dict(
            {
                'Status': 'SUCCESS',
                'PhysicalResourceId': event['PhysicalResourceId']
                    if 'PhysicalResourceId' in event
                    else context.log_stream_name
            },
            **{key: event[key] for key in
               ['StackId', 'RequestId', 'LogicalResourceId']}
        )
        log.debug(f'Response data: {responseData}')
        requests.put(event['ResponseURL'], data=json.dumps(responseData))
    except Exception as e:
        log.exception(f'Lambda failed! {e}')
        # https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/crpg-ref-responses.html
        responseData = dict(
            {
                'Status': 'FAILED',
                'Reason': f'See logs in {context.log_stream_name}',
                'PhysicalResourceId': event['PhysicalResourceId']
                    if 'PhysicalResourceId' in event
                    else context.log_stream_name,
            },
            **{key: event.get(key, '') for key in
               ['StackId', 'RequestId', 'LogicalResourceId']}
        )
        log.debug(f'Response data: {responseData}')
        requests.put(event['ResponseURL'], data=json.dumps(responseData))


def _fetch_commit_history(ghUrl):
    commit = _get_commit_info(ghUrl)
    commits = [commit]
    while commit.get('parents', []):
        commit = _get_commit_info(commit['parent_url'])
        commits.append(commit)
    return commits

def _get_commit_info(commit_url):
    """
    This assumes a strictly linear Git history (i.e. each commit except the first one has exactly
    one parent), because Real Programmers use ~~butterflies~~ rebases. Fite me IRL, Git-nerds.
    """
    commit = requests.get(commit_url).json()
    log.debug(f'Operating on {commit}')
    return {
        'sha': commit['sha'],
        'message': commit['commit']['message'],
        # We can safely do `['parents']`, here, because the `while` loop above enforces that
        # the value is present.
        'parent_url': commit['parents'][0]['url']
    }
