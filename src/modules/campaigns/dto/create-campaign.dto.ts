import { IsString, IsOptional, IsArray, IsDateString, MinLength } from 'class-validator';

export class CreateCampaignDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @IsString()
  templateId?: string;

  @IsOptional()
  @IsString()
  segment?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  contactIds?: string[];

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}
