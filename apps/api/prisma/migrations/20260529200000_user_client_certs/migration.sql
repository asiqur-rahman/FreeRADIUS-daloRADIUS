-- CreateTable
CREATE TABLE "user_client_certs" (
    "id"          TEXT NOT NULL,
    "userId"      TEXT NOT NULL,
    "fingerprint" VARCHAR(64) NOT NULL,
    "commonName"  VARCHAR(255) NOT NULL,
    "expiresAt"   TIMESTAMP(3) NOT NULL,
    "revokedAt"   TIMESTAMP(3),
    "notes"       VARCHAR(500),
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_client_certs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_client_certs_fingerprint_key" ON "user_client_certs"("fingerprint");

-- CreateIndex
CREATE INDEX "user_client_certs_userId_idx" ON "user_client_certs"("userId");

-- AddForeignKey
ALTER TABLE "user_client_certs"
    ADD CONSTRAINT "user_client_certs_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
