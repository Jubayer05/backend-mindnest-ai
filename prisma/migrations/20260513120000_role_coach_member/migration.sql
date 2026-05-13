-- MindNest AI: rename platform roles TUTOR→COACH, STUDENT→MEMBER

CREATE TYPE "Role_new" AS ENUM ('ADMIN', 'COACH', 'MEMBER');

ALTER TABLE "user" ALTER COLUMN "role" DROP DEFAULT;

ALTER TABLE "user" ALTER COLUMN "role" TYPE "Role_new" USING (
  CASE "role"::text
    WHEN 'TUTOR' THEN 'COACH'::"Role_new"
    WHEN 'CR' THEN 'COACH'::"Role_new"
    WHEN 'STUDENT' THEN 'MEMBER'::"Role_new"
    WHEN 'ADMIN' THEN 'ADMIN'::"Role_new"
    WHEN 'COACH' THEN 'COACH'::"Role_new"
    WHEN 'MEMBER' THEN 'MEMBER'::"Role_new"
    ELSE 'MEMBER'::"Role_new"
  END
);

ALTER TABLE "user" ALTER COLUMN "role" SET DEFAULT 'MEMBER'::"Role_new";

DROP TYPE "Role";

ALTER TYPE "Role_new" RENAME TO "Role";
