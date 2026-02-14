# CloudFront Markdown for LLMs

Inspired by Cloudflare's [Markdown for Agents](https://blog.cloudflare.com/markdown-for-agents/) announcement, this is an example project that achieves the same outcome — serving Markdown to LLMs based on the `Accept: text/markdown` header — but using Amazon CloudFront instead.

The approach differs because CloudFront Functions and Lambda@Edge do not allow direct access to the response body of an origin or viewer response, so there is no easy way to dynamically convert HTML to Markdown at the edge. Instead, this project pre-generates Markdown files from HTML using an S3-triggered Lambda function, and uses a CloudFront Function to rewrite the request URI to serve the `.md` file when the client asks for `text/markdown`.

## Architecture

```
Client (Accept: text/markdown) → CloudFront Function (rewrite .html→.md) → S3 (.md file)
Client (normal)                 → CloudFront Function (pass-through)     → S3 (.html file)

S3 (new .html object) → Lambda (turndown) → S3 (.md file alongside .html)
```

- **S3 Bucket** — stores both HTML and auto-generated Markdown files side by side
- **Lambda Function** — triggered on `s3:ObjectCreated` for `.html`/`.htm` files, converts HTML to Markdown using [turndown](https://github.com/mixmark-io/turndown), writes the `.md` file back to the same bucket
- **CloudFront Function** (viewer request) — checks the `Accept` header and rewrites the URI (`.html` → `.md`, directory paths → `index.md`)
- **Cache Policy** — includes the `Accept` header in the cache key so HTML and Markdown responses are cached separately
- **CloudFront Distribution** — S3 origin with Origin Access Control (OAC)

## Configuration

The rewrite behavior is configurable via `MarkdownRewriteConfig` in `bin/cloudfront-markdown-for-llms.ts`:

```typescript
rewriteConfig: {
  extensions: ['.html', '.htm'],  // file extensions to rewrite
  defaultDocument: 'index.html',  // default document for directory paths
  targetExtension: '.md',         // extension to rewrite to
}
```

These values are baked into the CloudFront Function code at deploy time.

## Deploy

```bash
npm install
npx cdk deploy
```

## Test

```bash
# Run unit tests
npm test

# After deploying, test HTML response (normal)
curl https://<distribution-domain>/index.html

# Test Markdown response
curl -H "Accept: text/markdown" https://<distribution-domain>/index.html

# Test directory-style Markdown access
curl -H "Accept: text/markdown" https://<distribution-domain>/
```

## Useful commands

* `npm run build`   compile TypeScript to JS
* `npm run watch`   watch for changes and compile
* `npm run test`    run the Jest unit tests
* `npx cdk deploy`  deploy this stack to your default AWS account/region
* `npx cdk diff`    compare deployed stack with current state
* `npx cdk synth`   emit the synthesized CloudFormation template

---

Built by [sh cloud software](https://www.sh-cloud.software) — AWS consulting with a focus on Serverless solutions.
