terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }

  # Remote state in S3 with native locking. Bucket is created by ../bootstrap.
  # Configure per-environment with:  terraform init -backend-config=backend.hcl
  #   (see backend.hcl.example)
  backend "s3" {
    key          = "infradian/eks/terraform.tfstate"
    use_lockfile = true
    encrypt      = true
  }
}

provider "aws" {
  region = var.region
  default_tags { tags = { Project = "infradian", ManagedBy = "terraform" } }
}
