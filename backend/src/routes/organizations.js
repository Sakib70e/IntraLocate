import { Elysia } from 'elysia';
import prisma from '../config/db.js';
import { authenticateUser, authorizeOrgMember } from '../middleware/auth.js';
import mlService from '../services/mlService.js';

function generateOrgCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = 'ORG-';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export const organizationRoutes = new Elysia({ prefix: '/api/orgs' })
  // Create Organization (User becomes ADMIN)
  .post('/create', async ({ headers, body, jwt, set }) => {
    const { user, error } = await authenticateUser(headers, jwt);
    if (error) {
      set.status = 401;
      return { success: false, error };
    }

    const { name, description, securityInfo } = body || {};
    if (!name || !name.trim()) {
      set.status = 400;
      return { success: false, error: 'Organization name is required' };
    }

    try {
      let code = generateOrgCode();
      let attempts = 0;
      while (attempts < 10) {
        const existing = await prisma.organization.findUnique({ where: { code } });
        if (!existing) break;
        code = generateOrgCode();
        attempts++;
      }

      const result = await prisma.$transaction(async (tx) => {
        const org = await tx.organization.create({
          data: {
            name: name.trim(),
            description: description ? description.trim() : null,
            code,
            joinSecurityInfo: securityInfo ? securityInfo.trim() : null,
          },
        });

        const membership = await tx.organizationMember.create({
          data: {
            userId: user.id,
            organizationId: org.id,
            role: 'ADMIN',
          },
        });

        return { org, membership };
      });

      return {
        success: true,
        data: {
          organization: {
            ...result.org,
            role: 'ADMIN',
          },
        },
      };
    } catch (err) {
      console.error('Create organization error:', err);
      set.status = 500;
      return { success: false, error: err.message || 'Failed to create organization' };
    }
  })

  // Join Organization via unique shareable code
  .post('/join', async ({ headers, body, jwt, set }) => {
    const { user, error } = await authenticateUser(headers, jwt);
    if (error) {
      set.status = 401;
      return { success: false, error };
    }

    const { code, securityInfo } = body || {};
    if (!code || !code.trim()) {
      set.status = 400;
      return { success: false, error: 'Organization code is required' };
    }

    const cleanCode = code.trim().toUpperCase();

    try {
      const org = await prisma.organization.findUnique({
        where: { code: cleanCode },
        include: {
          members: {
            where: { userId: user.id },
          },
        },
      });

      if (!org) {
        set.status = 404;
        return { success: false, error: 'Invalid organization code. No organization found with that code.' };
      }

      if (org.members.length > 0) {
        set.status = 400;
        return {
          success: false,
          error: 'You are already a member of this organization',
          data: {
            organization: {
              id: org.id,
              name: org.name,
              code: org.code,
              role: org.members[0].role,
            },
          },
        };
      }

      if (org.joinSecurityInfo && org.joinSecurityInfo.trim() !== '') {
        if (!securityInfo || securityInfo.trim() !== org.joinSecurityInfo.trim()) {
          set.status = 403;
          return { success: false, error: 'Incorrect security passphrase. Please ask your admin for the correct one.' };
        }
      }

      const membership = await prisma.organizationMember.create({
        data: {
          userId: user.id,
          organizationId: org.id,
          role: 'USER',
        },
      });

      return {
        success: true,
        data: {
          organization: {
            id: org.id,
            name: org.name,
            code: org.code,
            description: org.description,
            role: membership.role,
            joinedAt: membership.joinedAt,
          },
        },
      };
    } catch (err) {
      console.error('Join organization error:', err);
      set.status = 500;
      return { success: false, error: err.message || 'Failed to join organization' };
    }
  })

  // List all organizations for user
  .get('/my', async ({ headers, jwt, set }) => {
    const { user, error } = await authenticateUser(headers, jwt);
    if (error) {
      set.status = 401;
      return { success: false, error };
    }

    const memberships = await prisma.organizationMember.findMany({
      where: { userId: user.id },
      include: {
        organization: {
          include: {
            _count: {
              select: {
                members: true,
                sites: true,
                recordings: true,
              },
            },
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
    });

    const data = memberships.map((m) => ({
      id: m.organization.id,
      name: m.organization.name,
      code: m.organization.code,
      description: m.organization.description,
      role: m.role,
      joinedAt: m.joinedAt,
      counts: m.organization._count,
    }));

    return { success: true, data };
  })

  // Overview & stats for organization dashboard
  .get('/:id/overview', async ({ headers, params, jwt, set }) => {
    const { user, error } = await authenticateUser(headers, jwt);
    if (error) {
      set.status = 401;
      return { success: false, error };
    }

    const orgId = params.id;
    const { member, error: authError } = await authorizeOrgMember(user.id, orgId);
    if (authError) {
      set.status = 403;
      return { success: false, error: authError };
    }

    const [org, siteCount, floorCount, roomCount, recordingCount, modelCount] = await Promise.all([
      prisma.organization.findUnique({
        where: { id: orgId },
        include: {
          members: {
            include: {
              user: {
                select: { id: true, name: true, email: true },
              },
            },
            orderBy: { joinedAt: 'asc' },
          },
        },
      }),
      prisma.site.count({ where: { organizationId: orgId } }),
      prisma.floor.count({ where: { site: { organizationId: orgId } } }),
      prisma.room.count({ where: { floor: { site: { organizationId: orgId } } } }),
      prisma.fingerprintRecording.count({ where: { organizationId: orgId } }),
      prisma.modelVersion.count({ where: { organizationId: orgId } }),
    ]);

    return {
      success: true,
      data: {
        organization: {
          id: org.id,
          name: org.name,
          code: org.code,
          description: org.description,
          createdAt: org.createdAt,
          role: member.role,
        },
        stats: {
          members: org.members.length,
          sites: siteCount,
          floors: floorCount,
          rooms: roomCount,
          recordings: recordingCount,
          models: modelCount,
        },
        members: org.members.map((m) => ({
          id: m.id,
          userId: m.user.id,
          name: m.user.name,
          email: m.user.email,
          role: m.role,
          joinedAt: m.joinedAt,
        })),
      },
    };
  })

  // Update member role (Admin only)
  .patch('/:id/members/:memberId', async ({ headers, params, body, jwt, set }) => {
    const { user, error } = await authenticateUser(headers, jwt);
    if (error) {
      set.status = 401;
      return { success: false, error };
    }

    const orgId = params.id;
    const { error: authError } = await authorizeOrgMember(user.id, orgId, 'ADMIN');
    if (authError) {
      set.status = 403;
      return { success: false, error: authError };
    }

    const { role } = body || {};
    const normalizedRole = role === 'MEMBER' ? 'USER' : role;
    if (!normalizedRole || !['ADMIN', 'CONTRIBUTOR', 'USER'].includes(normalizedRole)) {
      set.status = 400;
      return { success: false, error: 'Role must be ADMIN, CONTRIBUTOR, or USER' };
    }

    const memberRecord = await prisma.organizationMember.findUnique({
      where: { id: params.memberId },
    });

    if (!memberRecord || memberRecord.organizationId !== orgId) {
      set.status = 404;
      return { success: false, error: 'Member not found' };
    }

    // Don't allow demoting yourself if you're the only admin
    if (memberRecord.userId === user.id && normalizedRole !== 'ADMIN') {
      const adminCount = await prisma.organizationMember.count({
        where: { organizationId: orgId, role: 'ADMIN' },
      });
      if (adminCount <= 1) {
        set.status = 400;
        return { success: false, error: 'Cannot remove the last admin from the organization' };
      }
    }

    const updated = await prisma.organizationMember.update({
      where: { id: params.memberId },
      data: { role: normalizedRole },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    return {
      success: true,
      data: {
        id: updated.id,
        userId: updated.user.id,
        name: updated.user.name,
        email: updated.user.email,
        role: updated.role,
        joinedAt: updated.joinedAt,
      },
    };
  })

  // Add existing user to organization as member or admin (Admin only)
  .post('/:id/members', async ({ headers, params, body, jwt, set }) => {
    const { user, error } = await authenticateUser(headers, jwt);
    if (error) {
      set.status = 401;
      return { success: false, error };
    }

    const orgId = params.id;
    const { error: authError } = await authorizeOrgMember(user.id, orgId, 'ADMIN');
    if (authError) {
      set.status = 403;
      return { success: false, error: authError };
    }

    const { email, role = 'USER' } = body || {};
    const normalizedRole = role === 'MEMBER' ? 'USER' : role;
    if (!['ADMIN', 'CONTRIBUTOR', 'USER'].includes(normalizedRole)) {
      set.status = 400;
      return { success: false, error: 'Role must be ADMIN, CONTRIBUTOR, or USER' };
    }
    if (!email || !email.trim()) {
      set.status = 400;
      return { success: false, error: 'User email is required' };
    }

    const targetUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!targetUser) {
      set.status = 404;
      return { success: false, error: 'User not found with this email' };
    }

    const existingMembership = await prisma.organizationMember.findUnique({
      where: {
        userId_organizationId: {
          userId: targetUser.id,
          organizationId: orgId,
        },
      },
    });

    if (existingMembership) {
      set.status = 400;
      return { success: false, error: 'User is already a member of this organization' };
    }

    const newMember = await prisma.organizationMember.create({
      data: {
        userId: targetUser.id,
        organizationId: orgId,
        role: ['ADMIN', 'MEMBER'].includes(role) ? role : 'MEMBER',
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    return {
      success: true,
      data: {
        id: newMember.id,
        userId: newMember.user.id,
        name: newMember.user.name,
        email: newMember.user.email,
        role: newMember.role,
        joinedAt: newMember.joinedAt,
      },
      message: `Added ${newMember.user.name} as ${newMember.role}`,
    };
  })

  // Remove member from organization (Admin only)
  .delete('/:id/members/:memberId', async ({ headers, params, jwt, set }) => {
    const { user, error } = await authenticateUser(headers, jwt);
    if (error) {
      set.status = 401;
      return { success: false, error };
    }

    const orgId = params.id;
    const { error: authError } = await authorizeOrgMember(user.id, orgId, 'ADMIN');
    if (authError) {
      set.status = 403;
      return { success: false, error: authError };
    }

    const memberRecord = await prisma.organizationMember.findUnique({
      where: { id: params.memberId },
    });

    if (!memberRecord || memberRecord.organizationId !== orgId) {
      set.status = 404;
      return { success: false, error: 'Member not found' };
    }

    if (memberRecord.userId === user.id) {
      set.status = 400;
      return { success: false, error: 'Use Leave Organization to remove yourself' };
    }

    await prisma.organizationMember.delete({ where: { id: params.memberId } });
    return { success: true, message: 'Member removed successfully' };
  })

  // Leave organization (Any member)
  .post('/:id/leave', async ({ headers, params, jwt, set }) => {
    const { user, error } = await authenticateUser(headers, jwt);
    if (error) {
      set.status = 401;
      return { success: false, error };
    }

    const orgId = params.id;
    const memberRecord = await prisma.organizationMember.findUnique({
      where: {
        userId_organizationId: {
          userId: user.id,
          organizationId: orgId,
        },
      },
    });

    if (!memberRecord) {
      set.status = 404;
      return { success: false, error: 'You are not a member of this organization' };
    }

    // Check all members to prevent orphaned organization states
    const allMembers = await prisma.organizationMember.findMany({
      where: { organizationId: orgId },
    });

    // If leaving user is ADMIN, ensure they are not the sole admin when other members exist
    if (memberRecord.role === 'ADMIN') {
      const adminCount = allMembers.filter((m) => m.role === 'ADMIN').length;
      if (adminCount === 1 && allMembers.length > 1) {
        set.status = 400;
        return {
          success: false,
          error:
            'You are the only administrator in this organization. Please promote another member to admin before leaving.',
        };
      }
    }

    // Clean up tracking session for this user in this org
    if (global._orgTrackingSignals?.has(orgId)) {
      global._orgTrackingSignals.get(orgId).delete(user.id);
    }

    // If the leaving user is the sole member in the organization, delete the org to prevent orphaned data
    if (allMembers.length <= 1) {
      await prisma.organization.delete({
        where: { id: orgId },
      });
      return {
        success: true,
        message: 'Successfully left the organization. The organization has been removed as you were the sole member.',
        orgDeleted: true,
      };
    }

    // Otherwise, delete the membership
    await prisma.organizationMember.delete({
      where: { id: memberRecord.id },
    });

    return {
      success: true,
      message: 'Successfully left the organization',
      orgDeleted: false,
    };
  })

  // Update custom organization join code (Admin only)
  .patch('/:id/code', async ({ headers, params, body, jwt, set }) => {
    const { user, error } = await authenticateUser(headers, jwt);
    if (error) {
      set.status = 401;
      return { success: false, error };
    }

    const orgId = params.id;
    const { error: authError } = await authorizeOrgMember(user.id, orgId, 'ADMIN');
    if (authError) {
      set.status = 403;
      return { success: false, error: authError };
    }

    const { code } = body || {};
    if (!code || typeof code !== 'string') {
      set.status = 400;
      return { success: false, error: 'Organization code is required' };
    }

    const cleanCode = code.trim().toUpperCase();

    // Validate format: 3 to 24 characters, alphanumeric, hyphens, and underscores
    if (!/^[A-Z0-9_-]{3,24}$/.test(cleanCode)) {
      set.status = 400;
      return {
        success: false,
        error:
          'Organization code must be 3-24 characters and contain only uppercase letters, numbers, hyphens, or underscores',
      };
    }

    // Check uniqueness across organizations
    const existing = await prisma.organization.findUnique({
      where: { code: cleanCode },
    });

    if (existing && existing.id !== orgId) {
      set.status = 409;
      return {
        success: false,
        error: `The code "${cleanCode}" is already taken by another organization. Please choose a different code.`,
      };
    }

    const updated = await prisma.organization.update({
      where: { id: orgId },
      data: { code: cleanCode },
    });

    return {
      success: true,
      data: {
        organization: {
          id: updated.id,
          name: updated.name,
          code: updated.code,
        },
      },
      message: `Organization join code updated to "${cleanCode}"`,
    };
  })

  // Transmit or update continuous Wi-Fi signal tracking permission/data (Any org member)
  .post('/:id/tracking', async ({ headers, params, body, jwt, set }) => {
    const { user, error } = await authenticateUser(headers, jwt);
    if (error) {
      set.status = 401;
      return { success: false, error };
    }

    const orgId = params.id;
    const { member, error: authError } = await authorizeOrgMember(user.id, orgId);
    if (authError) {
      set.status = 403;
      return { success: false, error: authError };
    }

    const { enabled = true, mode = 'background', wifiData = {}, apsCount = 0, siteId = null, floorId = null, roomId = null } = body || {};

    if (!global._orgTrackingSignals) {
      global._orgTrackingSignals = new Map();
    }
    if (!global._orgTrackingSignals.has(orgId)) {
      global._orgTrackingSignals.set(orgId, new Map());
    }

    const orgSignals = global._orgTrackingSignals.get(orgId);
    if (enabled) {
      let targetSiteId = siteId;
      let targetFloorId = floorId;
      let targetRoomId = roomId;
      let detectedRoom = null;

      // 1. If explicit room provided, verify it belongs to this org
      if (targetRoomId) {
        const r = await prisma.room.findFirst({
          where: { id: targetRoomId, floor: { site: { organizationId: orgId } } },
          include: { floor: { select: { id: true, name: true, siteId: true, site: { select: { name: true } } } } },
        });
        if (r) {
          targetSiteId = r.floor.siteId;
          targetFloorId = r.floor.id;
          detectedRoom = {
            roomId: r.id,
            roomName: r.name,
            floorName: r.floor.name,
            siteName: r.floor.site?.name || '',
            confidence: 100,
          };
        }
      }

      // 2. If no explicit room or not verified, calculate predicted room from models or centroids
      if (!detectedRoom && wifiData && Object.keys(wifiData).length > 0) {
        try {
          const sites = await prisma.site.findMany({
            where: { organizationId: orgId },
            select: { id: true, name: true },
          });

          // A. Try predicting via active trained models
          for (const s of sites) {
            try {
              const pred = await mlService.predictLocation(s.id, orgId, wifiData);
              if (pred && pred.prediction) {
                if (!detectedRoom || (pred.prediction.confidence > (detectedRoom.confidence || 0))) {
                  detectedRoom = {
                    siteId: s.id,
                    siteName: s.name,
                    roomId: pred.prediction.roomId,
                    roomName: pred.prediction.roomName,
                    floorId: pred.prediction.floorId,
                    floorName: pred.prediction.floorName,
                    confidence: pred.prediction.confidence,
                  };
                  targetSiteId = s.id;
                  targetFloorId = pred.prediction.floorId;
                  targetRoomId = pred.prediction.roomId;
                }
              }
            } catch (e) {
              // No model for this site
            }
          }

          // B. Fallback to raw fingerprint recordings centroid match
          if (!detectedRoom) {
            const recordings = await prisma.fingerprintRecording.findMany({
              where: { organizationId: orgId },
              select: {
                roomId: true,
                floorId: true,
                siteId: true,
                wifiData: true,
                room: {
                  select: {
                    id: true,
                    name: true,
                    floor: { select: { id: true, name: true, site: { select: { id: true, name: true } } } },
                  },
                },
              },
            });

            if (recordings.length > 0) {
              const roomGroups = {};
              recordings.forEach((r) => {
                if (!r.room) return;
                const rId = r.roomId;
                if (!roomGroups[rId]) {
                  roomGroups[rId] = {
                    roomId: r.roomId,
                    floorId: r.floorId,
                    siteId: r.siteId,
                    roomName: r.room.name,
                    floorName: r.room.floor?.name || '',
                    siteName: r.room.floor?.site?.name || '',
                    apSums: {},
                    apCounts: {},
                  };
                }
                if (r.wifiData && typeof r.wifiData === 'object') {
                  Object.entries(r.wifiData).forEach(([ap, rssi]) => {
                    const val = Number(rssi);
                    if (!isNaN(val)) {
                      roomGroups[rId].apSums[ap] = (roomGroups[rId].apSums[ap] || 0) + val;
                      roomGroups[rId].apCounts[ap] = (roomGroups[rId].apCounts[ap] || 0) + 1;
                    }
                  });
                }
              });

              let bestDist = Infinity;
              let bestRoom = null;

              Object.values(roomGroups).forEach((rg) => {
                let distSq = 0;
                let matched = 0;
                Object.keys(rg.apSums).forEach((ap) => {
                  const meanRssi = rg.apSums[ap] / rg.apCounts[ap];
                  const liveRssi = wifiData[ap] !== undefined ? Number(wifiData[ap]) : -110;
                  if (wifiData[ap] !== undefined) matched++;
                  const diff = liveRssi - meanRssi;
                  distSq += diff * diff;
                });

                if (matched > 0) {
                  const dist = Math.sqrt(distSq);
                  if (dist < bestDist) {
                    bestDist = dist;
                    bestRoom = rg;
                  }
                }
              });

              if (bestRoom) {
                const conf = Math.max(50, Math.min(95, Math.round(100 - bestDist * 0.4)));
                detectedRoom = {
                  siteId: bestRoom.siteId,
                  siteName: bestRoom.siteName,
                  floorId: bestRoom.floorId,
                  floorName: bestRoom.floorName,
                  roomId: bestRoom.roomId,
                  roomName: bestRoom.roomName,
                  confidence: conf,
                };
                targetSiteId = bestRoom.siteId;
                targetFloorId = bestRoom.floorId;
                targetRoomId = bestRoom.roomId;
              }
            }
          }
        } catch (err) {
          console.log('Error detecting room for tracking signal:', err);
        }
      }

      // 3. Update in-memory tracking signals (Live tracking is strictly isolated from ML training dataset)
      const existingSignal = orgSignals.get(user.id);
      const refreshReqTime = global._orgRefreshRequests?.get(orgId) || 0;
      const isRefresh = refreshReqTime > (existingSignal?.lastRefreshAcknowledged || 0);

      orgSignals.set(user.id, {
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        role: member.role,
        enabled: true,
        mode,
        wifiData,
        apsCount: apsCount || Object.keys(wifiData).length,
        detectedRoom: detectedRoom || null,
        targetRoomId,
        targetSiteId,
        targetFloorId,
        lastRefreshAcknowledged: isRefresh ? refreshReqTime : (existingSignal?.lastRefreshAcknowledged || 0),
        updatedAt: new Date().toISOString(),
      });

      // Persist status to database asynchronously
      prisma.organizationMember.updateMany({
        where: { userId: user.id, organizationId: orgId },
        data: {
          lastSeenAt: new Date(),
          lastSyncAt: new Date(),
          isTrackingActive: true,
          ...(detectedRoom ? { lastLocalization: detectedRoom } : {}),
        },
      }).catch(err => console.log('Error persisting tracking status to DB:', err.message));
    } else {
      orgSignals.delete(user.id);
      prisma.organizationMember.updateMany({
        where: { userId: user.id, organizationId: orgId },
        data: {
          lastSeenAt: new Date(),
          isTrackingActive: false,
        },
      }).catch(err => console.log('Error persisting tracking revoke to DB:', err.message));
    }

    return {
      success: true,
      data: {
        tracking: enabled,
        mode,
        activeTrackedCount: orgSignals.size,
        refreshRequested: (global._orgRefreshRequests?.get(orgId) || 0) > (orgSignals.get(user.id)?.lastRefreshAcknowledged || 0),
        detectedRoom: detectedRoom || null,
      },
      message: enabled ? 'Signal transmission active' : 'Signal transmission revoked',
    };
  })

  // Broadcast manual refresh request to tracking members (Admin only)
  .post('/:id/tracking/refresh-request', async ({ headers, params, jwt, set }) => {
    const { user, error } = await authenticateUser(headers, jwt);
    if (error) {
      set.status = 401;
      return { success: false, error };
    }

    const orgId = params.id;
    const { error: authError } = await authorizeOrgMember(user.id, orgId, 'ADMIN');
    if (authError) {
      set.status = 403;
      return { success: false, error: authError };
    }

    if (!global._orgRefreshRequests) {
      global._orgRefreshRequests = new Map();
    }
    const reqTime = Date.now();
    global._orgRefreshRequests.set(orgId, reqTime);

    const orgSignals = global._orgTrackingSignals?.get(orgId);
    const activeList = orgSignals ? Array.from(orgSignals.values()) : [];

    return {
      success: true,
      refreshRequestedAt: reqTime,
      activeDevicesCount: activeList.length,
      data: activeList,
      message: 'Refresh request broadcasted to all connected devices',
    };
  })

  // Check tracking status & refresh request (Any org member)
  .get('/:id/tracking/status', async ({ headers, params, jwt, set }) => {
    const { user, error } = await authenticateUser(headers, jwt);
    if (error) {
      set.status = 401;
      return { success: false, error };
    }

    const orgId = params.id;
    const { error: authError } = await authorizeOrgMember(user.id, orgId);
    if (authError) {
      set.status = 403;
      return { success: false, error: authError };
    }

    const refreshRequestedAt = global._orgRefreshRequests?.get(orgId) || 0;
    const orgSignals = global._orgTrackingSignals?.get(orgId);
    const userSignal = orgSignals?.get(user.id) || null;
    const lastAck = userSignal?.lastRefreshAcknowledged || 0;

    return {
      success: true,
      data: {
        refreshRequestedAt,
        refreshRequested: refreshRequestedAt > lastAck,
        trackingEnabled: !!userSignal?.enabled,
        mode: userSignal?.mode || 'background',
      },
    };
  })

  // Get current active tracked members with detected rooms and dataset sync metrics (Admin or Contributor)
  .get('/:id/tracking', async ({ headers, params, jwt, set }) => {
    const { user, error } = await authenticateUser(headers, jwt);
    if (error) {
      set.status = 401;
      return { success: false, error };
    }

    const orgId = params.id;
    const { error: authError } = await authorizeOrgMember(user.id, orgId, 'CONTRIBUTOR');
    if (authError) {
      set.status = 403;
      return { success: false, error: authError };
    }

    if (!global._orgTrackingSignals || !global._orgTrackingSignals.has(orgId)) {
      return { success: true, data: [] };
    }

    const orgSignals = global._orgTrackingSignals.get(orgId);
    const activeList = Array.from(orgSignals.values());
    return { success: true, data: activeList };
  })

  // Report device status and permissions (Any member)
  .post('/:id/device-status', async ({ headers, params, body, jwt, set }) => {
    const { user, error } = await authenticateUser(headers, jwt);
    if (error) {
      set.status = 401;
      return { success: false, error };
    }

    const orgId = params.id;
    const { member, error: authError } = await authorizeOrgMember(user.id, orgId);
    if (authError) {
      set.status = 403;
      return { success: false, error: authError };
    }

    const {
      locationPermission,
      bgLocationPermission,
      wifiScanStatus,
      locationServicesStatus,
      isTrackingActive,
      deviceModel,
      osVersion,
      detectedRoom,
    } = body || {};

    const now = new Date();

    const updateData = {
      lastSeenAt: now,
      lastSyncAt: now,
    };
    if (locationPermission !== undefined) updateData.locationPermission = locationPermission;
    if (bgLocationPermission !== undefined) updateData.bgLocationPermission = bgLocationPermission;
    if (wifiScanStatus !== undefined) updateData.wifiScanStatus = wifiScanStatus;
    if (locationServicesStatus !== undefined) updateData.locationServicesStatus = locationServicesStatus;
    if (isTrackingActive !== undefined) updateData.isTrackingActive = !!isTrackingActive;
    if (deviceModel !== undefined) updateData.deviceModel = deviceModel;
    if (osVersion !== undefined) updateData.osVersion = osVersion;
    if (detectedRoom) updateData.lastLocalization = detectedRoom;

    try {
      await prisma.organizationMember.updateMany({
        where: { userId: user.id, organizationId: orgId },
        data: updateData,
      });

      // Keep in-memory tracking signal up to date as well
      if (!global._orgTrackingSignals) {
        global._orgTrackingSignals = new Map();
      }
      if (!global._orgTrackingSignals.has(orgId)) {
        global._orgTrackingSignals.set(orgId, new Map());
      }
      const orgSignals = global._orgTrackingSignals.get(orgId);
      const existing = orgSignals.get(user.id) || {};
      orgSignals.set(user.id, {
        ...existing,
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        role: member.role,
        updatedAt: now.toISOString(),
        enabled: isTrackingActive !== undefined ? !!isTrackingActive : (existing.enabled ?? false),
        locationPermission: locationPermission !== undefined ? locationPermission : existing.locationPermission,
        bgLocationPermission: bgLocationPermission !== undefined ? bgLocationPermission : existing.bgLocationPermission,
        wifiScanStatus: wifiScanStatus !== undefined ? wifiScanStatus : existing.wifiScanStatus,
        locationServicesStatus: locationServicesStatus !== undefined ? locationServicesStatus : existing.locationServicesStatus,
        detectedRoom: detectedRoom || existing.detectedRoom,
      });

      const refreshReqTime = global._orgRefreshRequests?.get(orgId) || 0;
      const lastAck = existing?.lastRefreshAcknowledged || 0;

      return {
        success: true,
        data: {
          refreshRequested: refreshReqTime > lastAck,
          lastSeenAt: now.toISOString(),
        },
      };
    } catch (err) {
      console.error('Error updating device status:', err);
      set.status = 500;
      return { success: false, error: 'Failed to update device status' };
    }
  })

  // Get all organization users with real-time connectivity, device & permission status, and localization (Admin or Contributor)
  .get('/:id/users', async ({ headers, params, jwt, set }) => {
    const { user, error } = await authenticateUser(headers, jwt);
    if (error) {
      set.status = 401;
      return { success: false, error };
    }

    const orgId = params.id;
    const { error: authError } = await authorizeOrgMember(user.id, orgId, 'CONTRIBUTOR');
    if (authError) {
      set.status = 403;
      return { success: false, error: authError };
    }

    try {
      const members = await prisma.organizationMember.findMany({
        where: { organizationId: orgId },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              createdAt: true,
            },
          },
        },
        orderBy: { joinedAt: 'asc' },
      });

      const now = Date.now();
      const ONLINE_THRESHOLD_MS = 60 * 1000; // 60 seconds heartbeat threshold

      const orgSignals = global._orgTrackingSignals?.get(orgId);

      const usersList = members.map((m) => {
        const lastSeenTime = m.lastSeenAt ? new Date(m.lastSeenAt).getTime() : 0;
        const memorySignal = orgSignals?.get(m.userId);
        const memUpdatedTime = memorySignal?.updatedAt ? new Date(memorySignal.updatedAt).getTime() : 0;
        const effectiveLastSeenTime = Math.max(lastSeenTime, memUpdatedTime);
        const effectiveLastSeenAt = effectiveLastSeenTime > 0 ? new Date(effectiveLastSeenTime).toISOString() : null;

        const isOnline = effectiveLastSeenTime > 0 && (now - effectiveLastSeenTime) < ONLINE_THRESHOLD_MS;
        const isTrackingActive = !!(m.isTrackingActive || memorySignal?.enabled);
        const isActive = isTrackingActive && isOnline;

        // Permissions: If user is online, verified live status; if unreachable/offline, show Unknown / Stale or Denied
        const rawLoc = memorySignal?.locationPermission || m.locationPermission || 'UNKNOWN';
        const rawBgLoc = memorySignal?.bgLocationPermission || m.bgLocationPermission || 'UNKNOWN';
        const rawWifi = memorySignal?.wifiScanStatus || m.wifiScanStatus || 'UNKNOWN';
        const rawLocServices = memorySignal?.locationServicesStatus || m.locationServicesStatus || 'UNKNOWN';

        const lastLocalization = memorySignal?.detectedRoom || m.lastLocalization || null;

        // Never retain or show 'Granted' as live when device is unreachable
        let locationPermDisplay = 'Unknown';
        if (isOnline) {
          locationPermDisplay = rawLoc === 'Granted' ? 'Granted' : (rawLoc === 'Denied' ? 'Denied' : 'Unknown');
        } else {
          locationPermDisplay = rawLoc === 'Denied' ? 'Denied' : (rawLoc === 'Granted' ? 'Unknown / Stale' : 'Unknown');
        }

        let bgLocationPermDisplay = 'Unknown';
        if (isOnline) {
          bgLocationPermDisplay = rawBgLoc === 'Granted' ? 'Granted' : (rawBgLoc === 'Denied' ? 'Denied' : 'Unknown');
        } else {
          bgLocationPermDisplay = rawBgLoc === 'Denied' ? 'Denied' : (rawBgLoc === 'Granted' ? 'Unknown / Stale' : 'Unknown');
        }

        return {
          id: m.id,
          userId: m.user.id,
          name: m.user.name,
          email: m.user.email,
          role: m.role,
          joinedAt: m.joinedAt,
          isOnline,
          isActive,
          lastSeenAt: effectiveLastSeenAt,
          lastSyncAt: m.lastSyncAt ? m.lastSyncAt.toISOString() : null,
          deviceModel: m.deviceModel || null,
          osVersion: m.osVersion || null,
          locationPermission: locationPermDisplay,
          bgLocationPermission: bgLocationPermDisplay,
          permissions: {
            isLive: isOnline,
            isStale: !isOnline,
            location: locationPermDisplay,
            backgroundLocation: bgLocationPermDisplay,
            wifiScanning: rawWifi,
            locationServices: rawLocServices,
            displayLocation: locationPermDisplay,
            displayBackgroundLocation: bgLocationPermDisplay,
            displayWifiScanning: isOnline ? rawWifi : 'Unknown / Stale',
            displayLocationServices: isOnline ? rawLocServices : 'Unknown / Stale',
          },
          lastLocalization: lastLocalization ? {
            ...lastLocalization,
            isLive: isOnline,
          } : null,
        };
      });

      const onlineCount = usersList.filter((u) => u.isOnline).length;
      const activeCount = usersList.filter((u) => u.isActive).length;

      return {
        success: true,
        stats: {
          total: usersList.length,
          online: onlineCount,
          offline: usersList.length - onlineCount,
          activeTracking: activeCount,
        },
        data: usersList,
      };
    } catch (err) {
      console.error('Error fetching organization users:', err);
      set.status = 500;
      return { success: false, error: 'Failed to fetch organization users' };
    }
  });
