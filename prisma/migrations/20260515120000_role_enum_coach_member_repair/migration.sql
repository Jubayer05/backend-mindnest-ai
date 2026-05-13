-- Repair `Role` when the database still uses legacy labels (TUTOR, CR, STUDENT) so Prisma can use ADMIN / COACH / MEMBER.
-- Safe when `Role` is already ADMIN/COACH/MEMBER: each label maps to the same value on a new enum type, then the old type is dropped.

CREATE TYPE "Role_mn_repair" AS ENUM ('ADMIN', 'COACH', 'MEMBER');

ALTER TABLE "user" ALTER COLUMN "role" DROP DEFAULT;

ALTER TABLE "user" ALTER COLUMN "role" TYPE "Role_mn_repair" USING (
  CASE "role"::text
    WHEN 'ADMIN' THEN 'ADMIN'::"Role_mn_repair"
    WHEN 'COACH' THEN 'COACH'::"Role_mn_repair"
    WHEN 'MEMBER' THEN 'MEMBER'::"Role_mn_repair"
    WHEN 'TUTOR' THEN 'COACH'::"Role_mn_repair"
    WHEN 'CR' THEN 'COACH'::"Role_mn_repair"
    WHEN 'STUDENT' THEN 'MEMBER'::"Role_mn_repair"
    ELSE 'MEMBER'::"Role_mn_repair"
  END
);

ALTER TABLE "user" ALTER COLUMN "role" SET DEFAULT 'MEMBER'::"Role_mn_repair";

DROP TYPE "Role";

ALTER TYPE "Role_mn_repair" RENAME TO "Role";
