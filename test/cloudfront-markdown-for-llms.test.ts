import * as cdk from 'aws-cdk-lib/core';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { CloudfrontMarkdownForLlmsStack } from '../lib/cloudfront-markdown-for-llms-stack.js';

describe('CloudfrontMarkdownForLlmsStack', () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App();
    const stack = new CloudfrontMarkdownForLlmsStack(app, 'TestStack');
    template = Template.fromStack(stack);
  });

  test('creates an S3 bucket', () => {
    template.resourceCountIs('AWS::S3::Bucket', 1);
  });

  test('creates a CloudFront distribution', () => {
    template.resourceCountIs('AWS::CloudFront::Distribution', 1);
  });

  test('creates a CloudFront function with JS 2.0 runtime', () => {
    template.hasResourceProperties('AWS::CloudFront::Function', {
      FunctionConfig: {
        Runtime: 'cloudfront-js-2.0',
      },
    });
  });

  test('creates a Lambda function with Node.js runtime', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: Match.stringLikeRegexp('nodejs'),
      Handler: 'index.handler',
    });
  });

  test('CloudFront distribution uses OAC', () => {
    template.resourceCountIs('AWS::CloudFront::OriginAccessControl', 1);
  });

  test('cache policy includes Accept header', () => {
    template.hasResourceProperties('AWS::CloudFront::CachePolicy', {
      CachePolicyConfig: {
        ParametersInCacheKeyAndForwardedToOrigin: {
          HeadersConfig: {
            HeaderBehavior: 'whitelist',
            Headers: Match.arrayWith(['Accept']),
          },
        },
      },
    });
  });

  test('distribution associates CloudFront function on viewer-request', () => {
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: {
        DefaultCacheBehavior: {
          FunctionAssociations: Match.arrayWith([
            Match.objectLike({
              EventType: 'viewer-request',
            }),
          ]),
        },
      },
    });
  });

  test('distribution has default root object', () => {
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: {
        DefaultRootObject: 'index.html',
      },
    });
  });
});
