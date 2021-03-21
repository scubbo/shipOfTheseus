#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { PipelineOfTheseus } from '../lib/ship_of_theseus-stack';

const app = new cdk.App();
new PipelineOfTheseus(app, 'PipelineOfTheseus');
