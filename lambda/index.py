import datetime
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
            log.info('Uploading to S3...')
            log.info(object.put(Body=json.dumps(commit_data).encode('utf-8')))
            log.debug(f'Just uploaded a commits.json whose most-recent commit is {commit_data[0]}')
            # TODO - if we wanted to be really fancy here, we could only invalidate if the content
            # of the file is different (but that would be _super_-overkill for this silly little
            # project!)
            log.info(boto3.resource('cloudfront').create_invalidation(
                DistributionId=os.environ['distributionId'],
                InvalidationBatch={
                    'Paths': {
                        'Quantity': 1,
                        'Items': [
                            '/commits.json'
                        ],
                    },
                    'CallerReference': str(datetime.datetime.now())
                }
            ))
            log.debug('And just invalidated it in Cloudfront')
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
    while commit['parent_url']:
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
    parents = commit.get('parents', [])
    parent_url = parents[0]['url'] if parents else None
    return {
        'sha': commit['sha'],
        'message': commit['commit']['message'],
        'parent_url': parent_url  # Intentionally `None` for the root commit
    }
