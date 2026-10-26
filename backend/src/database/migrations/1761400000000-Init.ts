import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Generated with `npm run migration:generate` from the entities. */
export class Init1761400000000 implements MigrationInterface {
  name = 'Init1761400000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL, "email" character varying(320) NOT NULL, "password_hash" character varying(255) NOT NULL, "sync_version" bigint NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE TABLE "auth_tokens" ("id" uuid NOT NULL, "user_id" uuid NOT NULL, "token_hash" character(64) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_3a94cfa1eada85ac2bf6f3016b7" UNIQUE ("token_hash"), CONSTRAINT "PK_41e9ddfbb32da18c4e85e45c2fd" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_9691367d446cd8b18f462c191b" ON "auth_tokens"  ("user_id") `);
    await queryRunner.query(`CREATE TABLE "languages" ("user_id" uuid NOT NULL, "id" character varying(201) NOT NULL, "version" bigint NOT NULL, "deleted" boolean NOT NULL DEFAULT false, "name" character varying(500) NOT NULL, "created_at" bigint NOT NULL, CONSTRAINT "PK_5e1f08ea973ed265b699ece2597" PRIMARY KEY ("user_id", "id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_580305c48f56815e80d77cf350" ON "languages"  ("user_id", "version") `);
    await queryRunner.query(`CREATE TABLE "sets" ("user_id" uuid NOT NULL, "id" character varying(201) NOT NULL, "version" bigint NOT NULL, "deleted" boolean NOT NULL DEFAULT false, "language_code" character varying(100) NOT NULL, "name" character varying(500) NOT NULL, "pinned_at" bigint, "created_at" bigint NOT NULL, "updated_at" bigint NOT NULL, CONSTRAINT "PK_d336573ee41efe9e873ff44e80c" PRIMARY KEY ("user_id", "id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_b08bb03ac564ae83b8b0dcf9d4" ON "sets"  ("user_id", "version") `);
    await queryRunner.query(`CREATE TABLE "folders" ("user_id" uuid NOT NULL, "id" character varying(201) NOT NULL, "version" bigint NOT NULL, "deleted" boolean NOT NULL DEFAULT false, "language_code" character varying(100) NOT NULL, "name" character varying(500) NOT NULL, "position" integer NOT NULL, "pinned_at" bigint, "created_at" bigint NOT NULL, "updated_at" bigint NOT NULL, CONSTRAINT "PK_258f76cfe29ab58a7178a40bfd6" PRIMARY KEY ("user_id", "id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_04ecd092105b07df11f892fb45" ON "folders"  ("user_id", "version") `);
    await queryRunner.query(`CREATE TABLE "folder_sets" ("user_id" uuid NOT NULL, "id" character varying(201) NOT NULL, "version" bigint NOT NULL, "deleted" boolean NOT NULL DEFAULT false, "folder_id" character varying(100) NOT NULL, "set_id" character varying(100) NOT NULL, "added_at" bigint NOT NULL, CONSTRAINT "PK_c1e26819dc5e55d4332e08b4c77" PRIMARY KEY ("user_id", "id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_35254e32efb37fd01fdcef1e5c" ON "folder_sets"  ("user_id", "version") `);
    await queryRunner.query(`CREATE TABLE "words" ("user_id" uuid NOT NULL, "id" character varying(201) NOT NULL, "version" bigint NOT NULL, "deleted" boolean NOT NULL DEFAULT false, "set_id" character varying(100) NOT NULL, "language_code" character varying(100) NOT NULL, "term" text NOT NULL, "term_norm" text NOT NULL, "translation" text NOT NULL, "examples" jsonb NOT NULL DEFAULT '[]', "description" text NOT NULL DEFAULT '', "learned_at" bigint, "sort_at" bigint NOT NULL, "created_at" bigint NOT NULL, "updated_at" bigint NOT NULL, CONSTRAINT "PK_9e49e262d3b96703ac1587c5d4c" PRIMARY KEY ("user_id", "id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_6cc1b2e129cfb00e4e92c79329" ON "words"  ("user_id", "version") `);
    await queryRunner.query(`CREATE TABLE "rules" ("user_id" uuid NOT NULL, "id" character varying(201) NOT NULL, "version" bigint NOT NULL, "deleted" boolean NOT NULL DEFAULT false, "set_id" character varying(100) NOT NULL, "language_code" character varying(100) NOT NULL, "title" text NOT NULL DEFAULT '', "text" text NOT NULL, "created_at" bigint NOT NULL, "updated_at" bigint NOT NULL, CONSTRAINT "PK_2c1d985be8e3c5532e4cd8c6103" PRIMARY KEY ("user_id", "id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_ce9dc95b49ab51e256e537c3ae" ON "rules"  ("user_id", "version") `);
    await queryRunner.query(`ALTER TABLE "auth_tokens" ADD CONSTRAINT "FK_9691367d446cd8b18f462c191b3" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "languages" ADD CONSTRAINT "FK_5a27338bef532c5a30be70a7223" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "sets" ADD CONSTRAINT "FK_7e2be8b29e72267d90b655608d9" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "folders" ADD CONSTRAINT "FK_71af7633de585b66b4db26734c9" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "folder_sets" ADD CONSTRAINT "FK_ea8c3c39212b1bd439530a36fc0" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "words" ADD CONSTRAINT "FK_150aad5dbb7e13ebdeedbd8ea99" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "rules" ADD CONSTRAINT "FK_a25301750f8ef387215a9c6043b" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "rules" DROP CONSTRAINT "FK_a25301750f8ef387215a9c6043b"`);
    await queryRunner.query(`ALTER TABLE "words" DROP CONSTRAINT "FK_150aad5dbb7e13ebdeedbd8ea99"`);
    await queryRunner.query(`ALTER TABLE "folder_sets" DROP CONSTRAINT "FK_ea8c3c39212b1bd439530a36fc0"`);
    await queryRunner.query(`ALTER TABLE "folders" DROP CONSTRAINT "FK_71af7633de585b66b4db26734c9"`);
    await queryRunner.query(`ALTER TABLE "sets" DROP CONSTRAINT "FK_7e2be8b29e72267d90b655608d9"`);
    await queryRunner.query(`ALTER TABLE "languages" DROP CONSTRAINT "FK_5a27338bef532c5a30be70a7223"`);
    await queryRunner.query(`ALTER TABLE "auth_tokens" DROP CONSTRAINT "FK_9691367d446cd8b18f462c191b3"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_ce9dc95b49ab51e256e537c3ae"`);
    await queryRunner.query(`DROP TABLE "rules"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_6cc1b2e129cfb00e4e92c79329"`);
    await queryRunner.query(`DROP TABLE "words"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_35254e32efb37fd01fdcef1e5c"`);
    await queryRunner.query(`DROP TABLE "folder_sets"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_04ecd092105b07df11f892fb45"`);
    await queryRunner.query(`DROP TABLE "folders"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_b08bb03ac564ae83b8b0dcf9d4"`);
    await queryRunner.query(`DROP TABLE "sets"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_580305c48f56815e80d77cf350"`);
    await queryRunner.query(`DROP TABLE "languages"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_9691367d446cd8b18f462c191b"`);
    await queryRunner.query(`DROP TABLE "auth_tokens"`);
    await queryRunner.query(`DROP TABLE "users"`);
  }
}
