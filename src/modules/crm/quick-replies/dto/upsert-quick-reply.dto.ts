import { IsString, IsOptional, IsInt, Min } from 'class-validator';

export class UpsertQuickReplyDto {
  @IsString()
  title: string;

  @IsString()
  body: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
