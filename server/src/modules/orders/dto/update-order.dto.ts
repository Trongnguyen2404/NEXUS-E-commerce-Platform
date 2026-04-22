import { IsEnum, IsOptional, IsString } from "class-validator";
import { OrderStatus } from "@/modules/orders/dto/query-order.dto";

export class UpdateOrderDto {
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @IsString()
  trackingNumber?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}