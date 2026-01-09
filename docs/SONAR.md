# SonarQube (Local)

This repo supports running SonarQube locally via Docker Compose, and running the scanner via a Docker image (so you do **not** need a global `sonar-scanner` install).

## Quickstart

1. Start SonarQube

   ```bash
   pnpm sonar:start
   ```

2. Open SonarQube
   - http://localhost:9000
   - Default login is typically `admin` / `admin` (SonarQube may ask you to change it).

3. Create a token
   - In SonarQube: **My Account → Security → Generate Token**

4. Store the token locally

   Add this to `.env.local` (gitignored):

   ```bash
   SONAR_TOKEN=your_token_here
   ```

5. Run a full scan (typecheck + coverage + scan)

   ```bash
   pnpm sonar:full:dotenv
   ```

## Optional: custom Sonar host URL

By default, `pnpm sonar:scan` targets local SonarQube via Docker Desktop using:

- `http://host.docker.internal:9000`

If you need to target a different SonarQube server (CI, remote instance, etc.), set:

```bash
SONAR_HOST_URL=https://your-sonarqube.example.com
```

## Useful commands

```bash
pnpm sonar:start   # start SonarQube + Postgres containers
pnpm sonar:logs    # follow SonarQube logs
pnpm sonar:stop    # stop containers (keeps volumes)
pnpm sonar:down    # stop + remove containers (keeps volumes unless you remove them)
pnpm sonar:reset   # stop + remove containers AND wipe volumes (clean slate)

pnpm sonar:scan    # run scanner via Docker (requires SONAR_TOKEN env var)
```

## Notes

- Scanner configuration is in `sonar-project.properties`.
- Authentication uses `SONAR_TOKEN` via environment variable (kept in `.env.local`).

## Troubleshooting

- If `pnpm sonar:scan` fails with Docker errors, ensure Docker Desktop is running.
- If SonarQube takes a while to start, watch logs via `pnpm sonar:logs`.
