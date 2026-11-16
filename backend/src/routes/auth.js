import { Elysia } from 'elysia';
import bcrypt from 'bcryptjs';
import prisma from '../config/db.js';
import { authenticateUser } from '../middleware/auth.js';

export const authRoutes = new Elysia({ prefix: '/api/auth' })
  // User Registration
  .post('/register', async ({ body, jwt, set }) => {
    try {
      const { email, password, name } = body || {};

      if (!email || !password || !name) {
        set.status = 400;
        return { success: false, error: 'Email, password, and name are required' };
      }

      const normalizedEmail = email.toLowerCase().trim();

      const existing = await prisma.user.findUnique({
        where: { email: normalizedEmail },
      });

      if (existing) {
        set.status = 409;
        return { success: false, error: 'An account with this email already exists' };
      }

      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      const user = await prisma.user.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          name: name.trim(),
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
        },
      });

      const token = await jwt.sign({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      });

      return {
        success: true,
        data: {
          user,
          token,
          organizations: [],
        },
      };
    } catch (err) {
      console.error('Registration error:', err);
      set.status = 500;
      return { success: false, error: err.message || 'Registration failed' };
    }
  })

  // User Login
  .post('/login', async ({ body, jwt, set }) => {
    try {
      const { email, password } = body || {};

      if (!email || !password) {
        set.status = 400;
        return { success: false, error: 'Email and password are required' };
      }

      const normalizedEmail = email.toLowerCase().trim();

      const user = await prisma.user.findUnique({
        where: { email: normalizedEmail },
        include: {
          memberships: {
            include: {
              organization: true,
            },
          },
        },
      });

      if (!user) {
        set.status = 401;
        return { success: false, error: 'Invalid email or password' };
      }

      const isMatch = await bcrypt.compare(password, user.passwordHash);
      if (!isMatch) {
        set.status = 401;
        return { success: false, error: 'Invalid email or password' };
      }

      const token = await jwt.sign({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      });

      const organizations = user.memberships.map((m) => ({
        id: m.organization.id,
        name: m.organization.name,
        code: m.organization.code,
        description: m.organization.description,
        role: m.role,
        joinedAt: m.joinedAt,
      }));

      return {
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            createdAt: user.createdAt,
          },
          token,
          organizations,
        },
      };
    } catch (err) {
      console.error('Login error:', err);
      set.status = 500;
      return { success: false, error: err.message || 'Login failed' };
    }
  })

  // Current User Profile & Memberships
  .get('/me', async ({ headers, jwt, set }) => {
    const { user, error } = await authenticateUser(headers, jwt);
    if (error) {
      set.status = 401;
      return { success: false, error };
    }

    const organizations = user.memberships.map((m) => ({
      id: m.organization.id,
      name: m.organization.name,
      code: m.organization.code,
      description: m.organization.description,
      role: m.role,
      joinedAt: m.joinedAt,
    }));

    return {
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          createdAt: user.createdAt,
        },
        organizations,
      },
    };
  });
