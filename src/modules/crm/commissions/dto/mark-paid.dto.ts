import { IsArray, IsString } from 'class-validator';

export class MarkPaidDto {
  @IsArray()
  @IsString({ each: true })
  commissionIds: string[];
}
