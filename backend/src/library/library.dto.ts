import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

const MAX_ID = 100;
const MAX_NAME = 500;
const MAX_TEXT = 200_000;
/** Ids per reorder or bulk request. */
const MAX_IDS = 10_000;

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** A required, non-blank name (folder, set, language). */
export class NameDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Enter a name' })
  @MaxLength(MAX_NAME)
  name: string;
}

export class CreateFolderDto extends NameDto {
  @IsString()
  @MaxLength(MAX_ID)
  languageCode: string;
}

export class CreateSetDto extends CreateFolderDto {
  /** Also add the new set to this folder. */
  @IsOptional()
  @IsString()
  @MaxLength(MAX_ID)
  folderId?: string;
}

/** Rename and / or pin to top. */
export class UpdateItemDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Enter a name' })
  @MaxLength(MAX_NAME)
  name?: string;

  @IsOptional()
  @IsBoolean()
  pinned?: boolean;
}

export class IdsDto {
  @IsArray()
  @ArrayMaxSize(MAX_IDS)
  @IsString({ each: true })
  @MaxLength(MAX_ID, { each: true })
  ids: string[];
}

export class ExampleDto {
  @IsString()
  @MaxLength(MAX_TEXT)
  text: string;

  @IsString()
  @MaxLength(MAX_TEXT)
  translation: string;
}

export class WordPatchDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Enter the word' })
  @MaxLength(MAX_TEXT)
  term?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Enter the translation' })
  @MaxLength(MAX_TEXT)
  translation?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ExampleDto)
  examples?: ExampleDto[];

  /** Markdown; '' removes it. */
  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXT)
  description?: string;

  @IsOptional()
  @IsBoolean()
  learned?: boolean;

  /** Starred: listed above the other words of its part. */
  @IsOptional()
  @IsBoolean()
  favorite?: boolean;
}

export class CreateWordDto extends WordPatchDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Enter the word' })
  @MaxLength(MAX_TEXT)
  declare term: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Enter the translation' })
  @MaxLength(MAX_TEXT)
  declare translation: string;
}

export class RuleDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Enter a title' })
  @MaxLength(MAX_NAME)
  title: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Enter the rule' })
  @MaxLength(MAX_TEXT)
  text: string;
}
