# Production container

The production image serves the same API as `node dist/main.js` on port 3000, runs as the `node` user, and reports itself healthy through a `HEALTHCHECK` that fetches `/` and exits 0 on a 2xx. The stand-in is a local Colima VM: this recipe builds from the working tree and publishes the app only on loopback, without a registry, remote VM, ingress, HTTPS, or production secrets. Other deployment architectures and production configuration remain unverified.

## Sub-features

- `container-build` builds the `production` stage under a run-specific image tag.
- `container-run` serves `GET /` on a loopback-only host port.
- `container-healthcheck` reaches `healthy` on its own, with no manual health endpoint.
- `container-user` runs as `node`, not root.

## How to get to it (user POV)

With `CONTEXT` and `RUN_ID` exported as in the driving section below:

- Build the production image: `docker --context "$CONTEXT" build --target production -t "shifters-be:verify-$RUN_ID" .`
- Run it locally: `docker --context "$CONTEXT" run -d --name shifters-verify -p 127.0.0.1:3312:3000 "shifters-be:verify-$RUN_ID"`
- Inspect health: `docker --context "$CONTEXT" inspect --format '{{.State.Health.Status}}' shifters-verify`

## Driving it with control.mjs and Docker

Preconditions:

- A local verification run is launched, and `control.mjs doctor` reports `Doctor: drivable`. It provides the run id and the evidence directory; its doctor checks the local Node process, not the container.
- Export the context and run id for the journey, then prove the context answers before building:
  ```bash
  export CONTEXT=${VERIFY_DOCKER_CONTEXT:-colima}
  export RUN_ID=$(cat .verify/current)
  docker --context "$CONTEXT" info --format '{{.ServerVersion}}'
  ```
  On this host the default Colima profile owns the `colima` context. If `docker context ls` does not list it, start that profile with `colima start` and retry. If the repo's images live under another profile, set `VERIFY_DOCKER_CONTEXT` to that profile's context name. Use the explicit context on every Docker command; never run `docker context use` and change the user's global default.
- Record whether the context was reachable before the journey. If this run started Colima, stop it during teardown; if it was already running, leave it running.
- Host port 3312 is free and is not the local verification port 3311.
- No container is already named `shifters-verify` (running or stopped): `docker --context "$CONTEXT" container inspect shifters-verify` must report that it does not exist. If the name is taken, stop and choose a different name before running the recipe.
- The run-specific tag `shifters-be:verify-$RUN_ID` is not already in use; run ids make it unique.

- **Build.** Build the production stage under a tag unique to this run, without replacing a reusable image tag. Run:
  ```bash
  set -o pipefail
  docker --context "$CONTEXT" build --target production \
    -t "shifters-be:verify-$RUN_ID" . \
    2>&1 | tee ".verify/runs/$RUN_ID/artifacts/container-build.log"
  ```
  Exit code `0` proves the image build succeeded; the full build transcript is saved.
- **Run.** Start only on loopback and use a named container. Run:
  ```bash
  docker --context "$CONTEXT" run -d --name shifters-verify \
    -p 127.0.0.1:3312:3000 \
    "shifters-be:verify-$RUN_ID" \
    | tee ".verify/runs/$RUN_ID/artifacts/container-id.txt"
  ```
  The command prints a container id, and `docker --context "$CONTEXT" ps --filter name=shifters-verify` shows it `Up`.
- **Healthcheck.** Check the container's own health before sending a request. Run the inspect command until it prints `healthy`, bounded to two minutes:
  ```bash
  deadline=$((SECONDS + 120))
  while [ "$(docker --context "$CONTEXT" inspect --format '{{.State.Health.Status}}' shifters-verify 2>/dev/null)" != healthy ]; do
    if [ "$SECONDS" -ge "$deadline" ]; then
      docker --context "$CONTEXT" inspect --format '{{.State.Health.Status}}' shifters-verify
      exit 1
    fi
    sleep 2
  done
  ```
  `starting` is not a pass and `unhealthy` is a failure. Do not assume a fixed sleep duration.
- **Serve.** Request the published port, not the local app on 3311. Run:
  ```bash
  .opencode/skills/verify-shifters-be/scripts/control.mjs get / \
    --base http://127.0.0.1:3312 \
    --save container-root \
    --expect-status 200 \
    --expect-body 'Hello World!' \
    --expect-header 'content-type=text/html; charset=utf-8'
  ```
  All expectations pass and the artifact names port 3312.
- **User.** Read the configured user. Run `docker --context "$CONTEXT" inspect --format '{{.Config.User}}' shifters-verify`. It prints `node`.
- **Proof.** Save only the health and user fields, plus the startup log line, beside the HTTP artifact; do not save full container inspect output, which may include environment values. Run:
  ```bash
  docker --context "$CONTEXT" inspect --format '{{json .State.Health}}' shifters-verify \
    > ".verify/runs/$RUN_ID/artifacts/container-health.json"
  docker --context "$CONTEXT" inspect --format '{{.Config.User}}' shifters-verify \
    > ".verify/runs/$RUN_ID/artifacts/container-user.txt"
  docker --context "$CONTEXT" logs shifters-verify 2>&1 \
    | grep -F 'Nest application successfully started' \
    > ".verify/runs/$RUN_ID/artifacts/container-startup.log"
  ```
- **Teardown.** Remove only the named container and this run's unique image tag. Run:
  ```bash
  docker --context "$CONTEXT" rm -f shifters-verify
  docker --context "$CONTEXT" image rm "shifters-be:verify-$RUN_ID"
  docker --context "$CONTEXT" container inspect shifters-verify
  ```
  The last command must report no such container. After stopping the local Node run, run `colima stop` only if this verification run started Colima from a stopped state. Finally run `find ".verify/runs/$RUN_ID/artifacts" -type f -print` and confirm the proof files remain.

## Gotchas

- `colima start` does not necessarily change the active Docker context. On this host, plain `docker info` targets `/var/run/docker.sock` and fails even while Colima is running. Use `docker --context "$CONTEXT" ...`; do not run `docker context use colima` and alter the user's global default.
- This host has more than one Colima profile. `colima list` can show `default` and `vivir-be`; `docker context ls` currently lists `colima-vivir-be` and `default`, while the `colima` context appears only after the default profile starts. Use the profile that owns this repo's images; never borrow another project's profile.
- If the intended Docker context is unreachable, report the exact attempted command and error; do not substitute the local launch, which proves a different artifact.
- The first build installs pnpm and the full dependency tree. Expect minutes. A slow build is not a hang; watch the stage names in the output.
- The container's `starting` health state is not a pass. Only `healthy` proves the healthcheck.
- The healthcheck runs `node -e "fetch(...)"` inside the image, so it needs no `curl` in the image. A missing `node` or a changed `PORT` breaks it silently until the container turns `unhealthy`.
- The image copies `dist/` from the build stage. A stale local `dist/` is irrelevant, but a `src/` that fails `nest build` fails the image build.
- Publishing 3312 keeps the container from colliding with the local verification instance on 3311, and binds only to loopback. Never publish 3000 while a dev server may own it.
- Colima reports `aarch64`, so this run proves the arm64 image only. If deployment uses another architecture, build and run with its `--platform` on a matching target before claiming that platform is verified.
- The last recorded live pass (2026-11-03, run `20261103T184331Z-p3311`) used the `colima` context. Re-drive this journey after a Docker, Colima profile, or image change before claiming it is current.
- Colima is the local Docker VM used for this proof. Remote deployment, ingress, HTTPS, production secrets, and production health reporting remain unverified.
