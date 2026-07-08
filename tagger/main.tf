// Bookloop tagger infrastructure: SQS (+DLQ) -> Lambda, with Bedrock access.
//
// Prerequisites (one-time, see README.md):
//   - Bedrock model access granted for Claude Haiku + Titan Embed in `region`.
//   - AWS credentials with permission to create IAM/Lambda/SQS (NOT the
//     Bedrock-only app user).
//   - `npm run package` has produced tagger.zip.
//
//   terraform init && terraform apply -var "database_url=postgres://..."

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4"
    }
  }
}

variable "region" {
  type    = string
  default = "us-east-2"
}

variable "database_url" {
  type      = string
  sensitive = true
  # Supabase transaction pooler URL (port 6543). The Lambda uses prepare:false.
}

variable "tagger_model_id" {
  type    = string
  default = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
}

variable "embedding_model_id" {
  type    = string
  default = "amazon.titan-embed-text-v2:0"
}

provider "aws" {
  region = var.region
}

// --- Queue + dead-letter queue ---

resource "aws_sqs_queue" "tagger_dlq" {
  name                      = "bookloop-tagging-dlq"
  message_retention_seconds = 1209600 # 14 days
}

resource "aws_sqs_queue" "tagger" {
  name                       = "bookloop-tagging"
  visibility_timeout_seconds = 180 # >= Lambda timeout
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.tagger_dlq.arn
    maxReceiveCount     = 3
  })
}

// --- IAM role for the Lambda ---

resource "aws_iam_role" "tagger" {
  name = "bookloop-tagger-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "basic_logs" {
  role       = aws_iam_role.tagger.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "tagger" {
  name = "bookloop-tagger-policy"
  role = aws_iam_role.tagger.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"]
        Resource = aws_sqs_queue.tagger.arn
      },
      {
        # InvokeModel on "*" avoids the cross-region inference-profile ARN
        # complexity for the "us." Haiku profile. Tighten if you prefer.
        Effect   = "Allow"
        Action   = ["bedrock:InvokeModel"]
        Resource = "*"
      }
    ]
  })
}

// --- Lambda package ---
// Terraform builds the zip itself from function/ (run `npm install` there
// first so node_modules is present). No external `zip` CLI needed.

data "archive_file" "tagger" {
  type        = "zip"
  source_dir  = "${path.module}/function"
  output_path = "${path.module}/build/tagger.zip"
}

// --- Lambda ---

resource "aws_lambda_function" "tagger" {
  function_name    = "bookloop-tagger"
  role             = aws_iam_role.tagger.arn
  runtime          = "nodejs20.x"
  handler          = "index.handler"
  filename         = data.archive_file.tagger.output_path
  source_code_hash = data.archive_file.tagger.output_base64sha256
  timeout          = 120
  memory_size      = 512

  environment {
    variables = {
      DATABASE_URL       = var.database_url
      TAGGER_MODEL_ID    = var.tagger_model_id
      EMBEDDING_MODEL_ID = var.embedding_model_id
      AWS_BEDROCK_REGION = "us-east-2"
    }
  }
}

resource "aws_lambda_event_source_mapping" "sqs" {
  event_source_arn                   = aws_sqs_queue.tagger.arn
  function_name                      = aws_lambda_function.tagger.arn
  batch_size                         = 5
  maximum_batching_window_in_seconds = 10
  function_response_types            = ["ReportBatchItemFailures"]
}

output "queue_url" {
  description = "Set this as BOOKLOOP_TAGGING_QUEUE_URL in the app env."
  value       = aws_sqs_queue.tagger.url
}
