import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Starred words (WordEntity.favoriteAt). */
export class WordFavorites1762000000000 implements MigrationInterface {
  name = 'WordFavorites1762000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "words" ADD "favorite_at" bigint`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "words" DROP COLUMN "favorite_at"`);
  }
}
