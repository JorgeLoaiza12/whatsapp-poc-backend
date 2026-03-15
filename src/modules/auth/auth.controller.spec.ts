import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

const mockAuthService = {
  register: jest.fn(),
  login: jest.fn(),
};

const tokenResponse = {
  accessToken: 'test.jwt.token',
  userId: 'user-1',
  tenantId: 'tenant-1',
};

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockAuthService }],
    })
      // Bypass JWT guard for unit tests
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('register() delegates to AuthService.register and returns token', async () => {
    mockAuthService.register.mockResolvedValue(tokenResponse);

    const dto = {
      name: 'Alice',
      email: 'alice@test.com',
      password: 'Password123',
      companyName: 'Test Corp',
    };
    const result = await controller.register(dto);

    expect(mockAuthService.register).toHaveBeenCalledWith(dto);
    expect(result).toEqual(tokenResponse);
  });

  it('login() delegates to AuthService.login and returns token', async () => {
    mockAuthService.login.mockResolvedValue(tokenResponse);

    const dto = { email: 'alice@test.com', password: 'Password123' };
    const result = await controller.login(dto);

    expect(mockAuthService.login).toHaveBeenCalledWith(dto);
    expect(result).toEqual(tokenResponse);
  });

  it('me() returns the current user from the guard', () => {
    const user = { id: 'user-1', userId: 'user-1', email: 'alice@test.com', tenantId: 'tenant-1', role: 'OWNER' };
    const result = controller.me(user);
    expect(result).toEqual(user);
  });
});
