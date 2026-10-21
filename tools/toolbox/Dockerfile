# Every CLI the platform needs, so nothing has to be installed on the host except Docker.
FROM aquasec/trivy:0.57.1 AS trivy

FROM alpine:3.20
ARG TARGETARCH
ARG KIND_VERSION=v0.25.0
ARG HELM_VERSION=v3.16.2
ARG KUBECTL_VERSION=v1.31.2
ARG TERRAFORM_VERSION=1.10.2
ARG K6_VERSION=v0.55.0

RUN apk add --no-cache bash curl git docker-cli python3 py3-pip jq openssl unzip tar ca-certificates \
 && A=${TARGETARCH:-arm64} \
 && curl -fsSLo /usr/local/bin/kind https://kind.sigs.k8s.io/dl/${KIND_VERSION}/kind-linux-${A} \
 && curl -fsSLo /usr/local/bin/kubectl https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/${A}/kubectl \
 && chmod +x /usr/local/bin/kind /usr/local/bin/kubectl \
 && curl -fsSL https://get.helm.sh/helm-${HELM_VERSION}-linux-${A}.tar.gz | tar xz -C /tmp && mv /tmp/linux-${A}/helm /usr/local/bin/ \
 && curl -fsSLo /tmp/tf.zip https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION}/terraform_${TERRAFORM_VERSION}_linux_${A}.zip && unzip -q /tmp/tf.zip -d /usr/local/bin  \
 && curl -fsSL https://github.com/grafana/k6/releases/download/${K6_VERSION}/k6-${K6_VERSION}-linux-${A}.tar.gz | tar xz -C /tmp && mv /tmp/k6-*/k6 /usr/local/bin/ \
 && rm -rf /tmp/*

COPY --from=trivy /usr/local/bin/trivy /usr/local/bin/trivy

WORKDIR /work
CMD ["bash"]
