-- CreateEnum
CREATE TYPE "ContractType" AS ENUM ('CANDIDATE', 'EDUCATOR');

-- CreateTable: contracts (type başına tek active uygulama katmanında enforce edilir)
CREATE TABLE "contracts" (
    "id" UUID NOT NULL,
    "type" "ContractType" NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable: contract_acceptances (userId TEXT = users.id ile FK uyumu)
CREATE TABLE "contract_acceptances" (
    "id" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "contractId" UUID NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "contract_acceptances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: type+version tekilliği
CREATE UNIQUE INDEX "contracts_type_version_key" ON "contracts"("type", "version");

-- CreateIndex: contract_acceptances arama
CREATE INDEX "contract_acceptances_contractId_idx" ON "contract_acceptances"("contractId");
CREATE INDEX "contract_acceptances_userId_idx" ON "contract_acceptances"("userId");
CREATE UNIQUE INDEX "contract_acceptances_userId_contractId_key" ON "contract_acceptances"("userId", "contractId");

-- AddForeignKey: userId -> users(id)
ALTER TABLE "contract_acceptances" ADD CONSTRAINT "contract_acceptances_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: contractId -> contracts(id)
ALTER TABLE "contract_acceptances" ADD CONSTRAINT "contract_acceptances_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
