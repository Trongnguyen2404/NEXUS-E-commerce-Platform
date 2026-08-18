import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { UserResponseDto } from '@/modules/users/dto/user-response.dto';
import { PrismaService } from '@/prisma/prisma.service';
import { UpdateUserDto } from '@/modules/users/dto/update-user.dto';
import * as bcrypt from 'bcrypt';
import { ChangePasswordDto } from '@/modules/users/dto/change-password.dto';

// Reads and updates user accounts.
@Injectable()
export class UsersService {
  private readonly SALT_ROUNDS = 12;
  constructor(private prisma: PrismaService) {}

  // Loads one user by id.
  async findOne(userId: string): Promise<UserResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        password: false,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  // Lists every user, newest first.
  async findAll(): Promise<UserResponseDto[]> {
    return await this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        password: false,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Updates a profile, rejecting an email another account already uses.
  // Changing the email is re-authenticated: forgot-password mails the reset
  // link to whatever address is on the row, so a stolen 15-minute access token
  // must not be enough to redirect account recovery to the attacker.
  async update(
    userId: string,
    updateUserDto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    const { currentPassword, ...profile } = updateUserDto;

    const existingUser = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!existingUser) {
      throw new NotFoundException('User not found');
    }

    const isEmailChange =
      !!profile.email && profile.email !== existingUser.email;

    if (isEmailChange) {
      if (!currentPassword) {
        throw new BadRequestException(
          'Your current password is required to change your email address',
        );
      }

      const isPasswordValid = await bcrypt.compare(
        currentPassword,
        existingUser.password,
      );
      if (!isPasswordValid) {
        throw new UnauthorizedException('Current password is incorrect');
      }

      const emailTaken = await this.prisma.user.findUnique({
        where: { email: profile.email },
      });
      if (emailTaken) {
        throw new NotFoundException('Email is already taken');
      }
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      // An email change also drops the stored refresh token, so a session
      // opened with a token that has since been stolen cannot outlive it.
      data: isEmailChange ? { ...profile, refreshToken: null } : profile,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        password: false,
      },
    });

    return updatedUser;
  }

  // Replaces the password once the current one is confirmed.
  async changePassword(
    userId: string,
    changePasswordDto: ChangePasswordDto,
  ): Promise<{ message: string }> {
    const { currentPassword, newPassword } = changePasswordDto;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isPasswordValid = await bcrypt.compare(
      currentPassword,
      user.password,
    );

    if (!isPasswordValid) {
      throw new NotFoundException('Current password is incorrect');
    }

    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      throw new NotFoundException(
        'New password must be different from the current password',
      );
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, this.SALT_ROUNDS);

    await this.prisma.user.update({
      where: { id: userId },
      // Revoking the stored refresh token is the whole point of changing a
      // password under duress: without it a stolen refresh cookie keeps minting
      // access tokens afterwards. resetPassword already clears it this way.
      data: { password: hashedNewPassword, refreshToken: null },
    });

    return { message: 'Password changed successfully' };
  }

  // Deletes a user account.
  async remove(userId: string): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.prisma.user.delete({
      where: { id: userId },
    });

    return { message: 'User account deleted successfully' };
  }
}
