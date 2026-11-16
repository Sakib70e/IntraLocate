import prisma from '../config/db.js';

/**
 * Extracts and verifies JWT bearer token from request headers
 */
export async function authenticateUser(headers, jwt) {
  const authHeader = headers['authorization'] || headers['Authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { user: null, error: 'Unauthorized: Missing or invalid token' };
  }

  const token = authHeader.slice(7).trim();
  const payload = await jwt.verify(token);

  if (!payload || !payload.id) {
    return { user: null, error: 'Unauthorized: Invalid or expired token' };
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
      memberships: {
        include: {
          organization: true,
        },
      },
    },
  });

  if (!user) {
    return { user: null, error: 'Unauthorized: User not found' };
  }

  return { user, error: null };
}

/**
 * Validates that the user has an active membership in the organization.
 * If requiredRole is 'ADMIN', verifies that the member is an ADMIN.
 */
export async function authorizeOrgMember(userId, organizationId, requiredRole = null) {
  const member = await prisma.organizationMember.findUnique({
    where: {
      userId_organizationId: {
        userId,
        organizationId,
      },
    },
    include: {
      organization: true,
    },
  });

  if (!member) {
    return { member: null, error: 'Forbidden: You are not a member of this organization' };
  }

  if (requiredRole === 'ADMIN') {
    if (member.role !== 'ADMIN') {
      return { member: null, error: 'Forbidden: Requires ADMIN privileges' };
    }
  } else if (requiredRole === 'CONTRIBUTOR') {
    if (member.role !== 'ADMIN' && member.role !== 'CONTRIBUTOR') {
      return { member: null, error: 'Forbidden: Requires CONTRIBUTOR privileges' };
    }
  }

  return { member, error: null };
}
