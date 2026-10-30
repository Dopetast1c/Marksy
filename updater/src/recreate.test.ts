import { describe, expect, it } from 'vitest';
import type { ContainerInspect, ImageInspect } from './docker';
import { containerSpec } from './recreate';

// The new container is the old one on a new image: what compose set stays, what the old image brought goes, so that
// the new image's environment, labels, command and health check apply.

const oldImage: ImageInspect = {
  Id: 'sha256:old',
  RepoTags: [],
  RepoDigests: [],
  Config: {
    Env: ['PATH=/usr/bin', 'MARKSY_VERSION=1.0.0'],
    Cmd: ['serve'],
    Entrypoint: ['node', '/app/dist/marksy.mjs'],
    Labels: { 'org.opencontainers.image.version': '1.0.0' },
  },
};

const old: ContainerInspect = {
  Id: 'abcdef1234567890',
  Name: '/marksy-prod-backup-1',
  Image: 'sha256:old',
  Config: {
    Env: ['PATH=/usr/bin', 'MARKSY_VERSION=1.0.0', 'TZ=Europe/Vienna', 'DATABASE_URL=postgres://x'],
    Cmd: ['backup-daemon'],
    Entrypoint: ['node', '/app/dist/marksy.mjs'],
    Labels: {
      'org.opencontainers.image.version': '1.0.0',
      'com.docker.compose.project': 'marksy-prod',
      'com.docker.compose.service': 'backup',
      'com.docker.compose.image': 'sha256:old',
      'marksy.updatable': 'true',
    },
    Healthcheck: { Test: ['CMD', 'node', '-e', 'x'] },
  },
  HostConfig: {
    NetworkMode: 'marksy-prod_backend',
    Binds: ['/srv/backups:/backups'],
    RestartPolicy: { Name: 'unless-stopped' },
  },
  NetworkSettings: {
    Networks: {
      'marksy-prod_edge': { Aliases: ['backup', 'abcdef123456'] },
      'marksy-prod_backend': { Aliases: ['backup'], IPAMConfig: {} },
    },
  },
  State: { Status: 'running', Running: true, ExitCode: 0 },
  RestartCount: 0,
};

describe('the replacement container', () => {
  const spec = containerSpec(old, oldImage, 'ghcr.io/dopetast1c/marksy-server:1', 'sha256:new');

  it('keeps what compose set and drops what the old image brought', () => {
    expect(spec.name).toBe('marksy-prod-backup-1');
    expect(spec.body.Env).toEqual(['TZ=Europe/Vienna', 'DATABASE_URL=postgres://x']);
    expect(spec.body.Labels).toEqual({
      'com.docker.compose.project': 'marksy-prod',
      'com.docker.compose.service': 'backup',
      'com.docker.compose.image': 'sha256:new',
      'marksy.updatable': 'true',
    });
    expect(spec.body.Cmd).toEqual(['backup-daemon']);
    expect(spec.body).not.toHaveProperty('Entrypoint');
    expect(spec.body.Healthcheck).toEqual({ Test: ['CMD', 'node', '-e', 'x'] });
    expect(spec.body.HostConfig).toBe(old.HostConfig);
  });

  it("is created on the network of NetworkMode and connected to the others, without the old container's id", () => {
    expect(spec.body.NetworkingConfig).toEqual({ EndpointsConfig: { 'marksy-prod_backend': { Aliases: ['backup'] } } });
    expect(spec.more).toEqual([['marksy-prod_edge', { Aliases: ['backup'] }]]);
  });
});
