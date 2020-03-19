FROM alpine:3.11@sha256:3983cc12fb9dc20a009340149e382a18de6a8261b0ac0e8f5fcdf11f8dd5937e as builder

RUN apk add --no-cache bash=5.0.11-r1 git=2.24.1-r0 openssh=8.1_p1-r0 build-base=0.5-r1

WORKDIR /opt
RUN git clone --branch v0.14.0 https://github.com/google/jsonnet.git

WORKDIR /opt/jsonnet
RUN make

RUN mkdir /dashboards
COPY jsonnet /dashboards
WORKDIR /dashboards

ENV PATH="/opt/jsonnet:${PATH}"

RUN ./build.sh

FROM grafana/grafana:6.7.0@sha256:e9897f8e237244f7c7accb97a3a11b09b76a8e6bb06bc4f8a099285c53f1b164 as production

LABEL org.opencontainers.image.url=https://sourcegraph.com/
LABEL org.opencontainers.image.source=https://github.com/sourcegraph/sourcegraph/
LABEL org.opencontainers.image.documentation=https://docs.sourcegraph.com/
LABEL com.sourcegraph.grafana.version=6.4.2

# hadolint ignore=DL3020
ADD --chown=grafana:grafana config /sg_config_grafana
COPY home.json /usr/share/grafana/public/dashboards/home.json

COPY --from=builder /dashboards/*.json /sg_config_grafana/provisioning/dashboards/sourcegraph_internal/

# hadolint ignore=DL3020
ADD --chown=grafana:grafana entry.sh /

USER root
# hadolint ignore=DL3018
RUN apk add --no-cache curl

USER grafana
ENTRYPOINT ["/entry.sh"]
