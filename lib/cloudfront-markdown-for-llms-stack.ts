import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as path from 'path';

export interface MarkdownRewriteConfig {
  /** File extensions to consider for rewriting (e.g., ['.html', '.htm']) */
  readonly extensions: string[];
  /** Default file name served when a path has no extension (e.g., 'index.html') */
  readonly defaultDocument: string;
  /** Target extension to rewrite to (e.g., '.md') */
  readonly targetExtension: string;
}

export interface CloudfrontMarkdownForLlmsStackProps extends cdk.StackProps {
  readonly rewriteConfig?: MarkdownRewriteConfig;
}

const defaultRewriteConfig: MarkdownRewriteConfig = {
  extensions: ['.html', '.htm'],
  defaultDocument: 'index.html',
  targetExtension: '.md',
};

function generateCfFunctionCode(config: MarkdownRewriteConfig): string {
  return `
var EXTENSIONS = ${JSON.stringify(config.extensions)};
var DEFAULT_DOCUMENT = ${JSON.stringify(config.defaultDocument)};
var TARGET_EXTENSION = ${JSON.stringify(config.targetExtension)};

function handler(event) {
  var request = event.request;
  var headers = request.headers;
  var uri = request.uri;

  var acceptHeader = headers['accept'] ? headers['accept'].value : '';

  if (acceptHeader.indexOf('text/markdown') === -1) {
    return request;
  }

  var lastSegment = uri.split('/').pop();
  var hasExtension = lastSegment.indexOf('.') !== -1;

  if (!hasExtension) {
    var defaultBase = DEFAULT_DOCUMENT.substring(0, DEFAULT_DOCUMENT.lastIndexOf('.'));
    var suffix = (uri.charAt(uri.length - 1) === '/' ? '' : '/');
    request.uri = uri + suffix + defaultBase + TARGET_EXTENSION;
    return request;
  }

  for (var i = 0; i < EXTENSIONS.length; i++) {
    var ext = EXTENSIONS[i];
    if (uri.length >= ext.length && uri.substring(uri.length - ext.length) === ext) {
      request.uri = uri.substring(0, uri.length - ext.length) + TARGET_EXTENSION;
      return request;
    }
  }

  return request;
}
`;
}

export class CloudfrontMarkdownForLlmsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: CloudfrontMarkdownForLlmsStackProps) {
    super(scope, id, props);

    const config = props?.rewriteConfig ?? defaultRewriteConfig;

    // S3 bucket for HTML and Markdown content
    const contentBucket = new s3.Bucket(this, 'ContentBucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // Lambda function to convert HTML to Markdown
    const converterFn = new lambdaNodejs.NodejsFunction(this, 'HtmlToMarkdownFn', {
      entry: path.join(__dirname, '..', 'lambda', 'html-to-markdown', 'index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(30),
      bundling: {
        minify: true,
      },
    });

    contentBucket.grantRead(converterFn);
    contentBucket.grantPut(converterFn);

    // Trigger Lambda on ObjectCreated for each configured extension
    for (const ext of config.extensions) {
      contentBucket.addEventNotification(
        s3.EventType.OBJECT_CREATED,
        new s3n.LambdaDestination(converterFn),
        { suffix: ext },
      );
    }

    // CloudFront Function for viewer-request rewriting
    const rewriteFunction = new cloudfront.Function(this, 'MarkdownRewriteFn', {
      code: cloudfront.FunctionCode.fromInline(generateCfFunctionCode(config)),
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      comment: 'Rewrites requests to .md when Accept: text/markdown is present',
    });

    // Cache policy that includes Accept header in cache key
    const cachePolicy = new cloudfront.CachePolicy(this, 'MarkdownCachePolicy', {
      headerBehavior: cloudfront.CacheHeaderBehavior.allowList('Accept'),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
    });

    // CloudFront distribution
    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(contentBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        functionAssociations: [{
          function: rewriteFunction,
          eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
        }],
        cachePolicy,
      },
      defaultRootObject: 'index.html',
    });

    // Deploy sample HTML content
    new s3deploy.BucketDeployment(this, 'DeploySampleContent', {
      sources: [s3deploy.Source.asset(path.join(__dirname, '..', 'sample-content'))],
      destinationBucket: contentBucket,
      distribution,
      distributionPaths: ['/*'],
    });

    // Outputs
    new cdk.CfnOutput(this, 'DistributionDomainName', {
      value: distribution.distributionDomainName,
      description: 'CloudFront distribution domain name',
    });

    new cdk.CfnOutput(this, 'BucketName', {
      value: contentBucket.bucketName,
      description: 'S3 bucket name',
    });
  }
}
