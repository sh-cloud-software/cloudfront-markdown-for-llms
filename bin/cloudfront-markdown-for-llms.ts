#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { CloudfrontMarkdownForLlmsStack } from '../lib/cloudfront-markdown-for-llms-stack.js';

const app = new cdk.App();
new CloudfrontMarkdownForLlmsStack(app, 'CloudfrontMarkdownForLlmsStack', {
  rewriteConfig: {
    extensions: ['.html', '.htm'],
    defaultDocument: 'index.html',
    targetExtension: '.md',
  },
});
