variable "region" {
  type    = string
  default = "us-east-1"
}
variable "name" {
  type    = string
  default = "infradian"
}
variable "vpc_cidr" {
  type    = string
  default = "10.20.0.0/16"
}
variable "kubernetes_version" {
  type    = string
  default = "1.31"
}
variable "node_instance_types" {
  type    = list(string)
  default = ["t3.medium"]
}
variable "node_desired_size" {
  type    = number
  default = 2
}
