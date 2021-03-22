import json
import os
import requests

import logging
# https://stackoverflow.com/questions/37703609
log = logging.getLogger(__name__)
log.setLevel(logging.DEBUG)


def handler(event, context):
    try:
        log.debug(f'DEBUG - called!')
        log.info(f'Event: {event}')
        if event['RequestType'] in ['Create', 'Update']:
            log.debug(os.environ)
            log.debug(os.environ['githubCommitsUrl'])
            log.debug(requests.get(os.environ['githubCommitsUrl']).content)
            # TODO - pass in the commit that the pipeline's working on, and restrict this
            # to only "commits prior to that", just in case there are two commits in quick succession
            # TODO - write the data to `commits.json` in the S3 bucket.
        else:
            log.info('Non-create/update RequestType')
        responseData = dict(
            {'Status': 'SUCCESS'},
            **{key: event.get(key, '') for key in
               ['PhysicalResourceId', 'StackId', 'RequestId', 'LogicalResourceId']}
        )
        log.debug(f'Response data: {responseData}')
        requests.put(event['ResponseURL'], data=responseData)
    except Exception as e:
        log.error(f'Lambda failed! {e}')
        responseData = dict(
            {'Status': 'FAILED'},
            **{key: event.get(key, '') for key in
               ['PhysicalResourceId', 'StackId', 'RequestId', 'LogicalResourceId']}
        )
        log.debug(f'Response data: {responseData}')
        requests.put(event['ResponseURL'], data=responseData)
