# Smoke HTTP checks for Dal v2 (development)

Run these commands to quickly verify the running backend and core endpoints.

Notes:
- Ensure Docker compose stack is running (infra/docker).
- Replace <TOKEN> with a valid JWT for protected endpoints if needed.

1) Health

```bash
curl -i http://localhost:3000/health
```

Expect: HTTP/1.1 200 OK and body: {"ok":true,"service":"dal"}

2) Marketplace - list published tests (public)

```bash
curl -i "http://localhost:3000/marketplace/tests"
```

Expect: HTTP/1.1 200 OK and JSON array (may be empty or seeded).

3) Auth register (example)

```bash
curl -i -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"smoke+user@example.com","username":"smokeuser","password":"Password123"}'
```

Expect: 200/201 and user public object (or created).

4) Auth login (example)

```bash
curl -i -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"smoke+user@example.com","password":"Password123"}'
```

Expect: 200 and JSON with token field.

5) Purchase flow (requires token from login)

```bash
# Set TOKEN from login response
curl -i -X POST "http://localhost:3000/purchases/<TEST_ID>" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{"amount": 10.0}'
```

Expect: 200/201 and the created purchase; check DB for attempt and audit log.

6) Attempts - submit answer & finish

```bash
# Submit answer
curl -i -X POST "http://localhost:3000/attempts/<ATTEMPT_ID>/answers" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{"questionId":"<Q_ID>","optionId":"<OPTION_ID>"}'

# Finish attempt
curl -i -X POST "http://localhost:3000/attempts/<ATTEMPT_ID>/finish" \
  -H "Authorization: Bearer <TOKEN>"
```

Expect: submission accepted and finishing returns score/update.

7) DB verification (Postgres container)

```bash
docker compose exec postgres psql -U postgres -d sinavsalonu_v2 -c "\dt"
docker compose exec postgres psql -U postgres -d sinavsalonu_v2 -c "\dT+"
```

Expect: tables `exam_tests`, `purchases`, `test_attempts`, `attempt_answers` (or attempt_answers mapped table), `audit_logs` and enums exist.

