import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Sets shared by code (SharedSet). */
export class SharedSets1761500000000 implements MigrationInterface {
  name = 'SharedSets1761500000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "shared_sets" ("code" character varying(16) NOT NULL, "user_id" uuid NOT NULL, "payload" jsonb NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_shared_sets" PRIMARY KEY ("code"))`);
    await queryRunner.query(`CREATE INDEX "IDX_shared_sets_user_id" ON "shared_sets"  ("user_id") `);
    await queryRunner.query(`CREATE INDEX "IDX_shared_sets_expires_at" ON "shared_sets"  ("expires_at") `);
    await queryRunner.query(`ALTER TABLE "shared_sets" ADD CONSTRAINT "FK_shared_sets_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "shared_sets" DROP CONSTRAINT "FK_shared_sets_user"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_shared_sets_expires_at"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_shared_sets_user_id"`);
    await queryRunner.query(`DROP TABLE "shared_sets"`);
  }
}
