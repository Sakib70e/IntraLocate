import prisma from '../config/db.js';

const MISSING_SIGNAL_RSSI = -110;

/**
 * Clean & normalize AP identifiers for consistency
 */
export function cleanAPKey(key) {
  if (!key) return 'Unknown_AP';
  return String(key).trim().replace(/^["']+|["']+$/g, '');
}

/**
 * Calculate Gini Impurity for a set of room labels
 */
function calculateGini(labels) {
  if (labels.length === 0) return 0;
  const counts = {};
  labels.forEach((l) => (counts[l] = (counts[l] || 0) + 1));
  let sumSq = 0;
  const n = labels.length;
  Object.values(counts).forEach((c) => {
    const p = c / n;
    sumSq += p * p;
  });
  return 1 - sumSq;
}

/**
 * Build a Decision Tree using plain serializable objects (no class instances)
 * so they survive JSON round-trips correctly.
 */
function buildTree(X, y, depth = 0, maxDepth = 8, numFeaturesToSample = null) {
  const nSamples = X.length;
  const nFeatures = X[0] ? X[0].length : 0;

  // Leaf check
  const uniqueLabels = Array.from(new Set(y));
  if (nSamples < 2 || uniqueLabels.length === 1 || depth >= maxDepth) {
    const counts = {};
    y.forEach((lbl) => (counts[lbl] = (counts[lbl] || 0) + 1));
    const probs = {};
    Object.keys(counts).forEach((lbl) => {
      probs[lbl] = counts[lbl] / nSamples;
    });
    return { leaf: true, probs };
  }

  // Feature sub-sampling for Random Forest
  const numSub = numFeaturesToSample || Math.max(1, Math.floor(Math.sqrt(nFeatures)));
  const allIndices = Array.from({ length: nFeatures }, (_, i) => i);
  for (let i = allIndices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allIndices[i], allIndices[j]] = [allIndices[j], allIndices[i]];
  }
  const featureIndices = allIndices.slice(0, numSub);

  let bestGain = -1;
  let bestFeature = null;
  let bestThreshold = null;
  let bestLeftX = [], bestLeftY = [], bestRightX = [], bestRightY = [];

  const parentGini = calculateGini(y);

  featureIndices.forEach((fIdx) => {
    const featureVals = Array.from(new Set(X.map((row) => row[fIdx]))).sort((a, b) => a - b);
    for (let i = 0; i < featureVals.length - 1; i++) {
      const thresh = (featureVals[i] + featureVals[i + 1]) / 2;
      const leftX = [], leftY = [], rightX = [], rightY = [];

      for (let s = 0; s < nSamples; s++) {
        if (X[s][fIdx] <= thresh) {
          leftX.push(X[s]);
          leftY.push(y[s]);
        } else {
          rightX.push(X[s]);
          rightY.push(y[s]);
        }
      }

      if (leftY.length === 0 || rightY.length === 0) continue;

      const leftGini = calculateGini(leftY);
      const rightGini = calculateGini(rightY);
      const weightedGini = (leftY.length / nSamples) * leftGini + (rightY.length / nSamples) * rightGini;
      const gain = parentGini - weightedGini;

      if (gain > bestGain) {
        bestGain = gain;
        bestFeature = fIdx;
        bestThreshold = thresh;
        bestLeftX = leftX;
        bestLeftY = leftY;
        bestRightX = rightX;
        bestRightY = rightY;
      }
    }
  });

  if (bestGain <= 0 || !bestLeftX.length || !bestRightX.length) {
    const counts = {};
    y.forEach((lbl) => (counts[lbl] = (counts[lbl] || 0) + 1));
    const probs = {};
    Object.keys(counts).forEach((lbl) => {
      probs[lbl] = counts[lbl] / nSamples;
    });
    return { leaf: true, probs };
  }

  const left = buildTree(bestLeftX, bestLeftY, depth + 1, maxDepth, numFeaturesToSample);
  const right = buildTree(bestRightX, bestRightY, depth + 1, maxDepth, numFeaturesToSample);

  return { leaf: false, featureIndex: bestFeature, threshold: bestThreshold, left, right };
}

/**
 * Predict class probabilities for a single row using a plain-object Decision Tree.
 * Works correctly after JSON serialization/deserialization.
 */
function predictTree(node, row) {
  if (!node) return {};
  if (node.leaf) {
    return node.probs || {};
  }
  if (row[node.featureIndex] <= node.threshold) {
    return predictTree(node.left, row);
  } else {
    return predictTree(node.right, row);
  }
}

/**
 * Seeded pseudo-random number generator (Mulberry32) for reproducible splits and training.
 */
function createRng(seed = 42) {
  let s = (seed >>> 0) || 42;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Reproducible stratified 90/10 train-test split grouped by room (class label).
 * Keeps held-out test samples strictly unseen for final evaluation.
 */
function stratifiedTrainTestSplit(recordings, testRatio = 0.10, seed = 42) {
  const rng = createRng(seed);

  // Group recording indices by room
  const byRoom = {};
  recordings.forEach((r, idx) => {
    const key = r.roomId;
    if (!byRoom[key]) byRoom[key] = [];
    byRoom[key].push(idx);
  });

  const trainIndices = [];
  const testIndices = [];

  // For each room, shuffle indices reproducibly and partition
  Object.keys(byRoom).forEach((roomId) => {
    const indices = [...byRoom[roomId]];
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }

    if (indices.length <= 1) {
      // Room only has 1 sample: must be in train so the class can be modeled
      trainIndices.push(...indices);
    } else {
      let nTest = Math.floor(indices.length * testRatio);
      if (nTest >= indices.length) {
        nTest = indices.length - 1;
      }
      const testPart = indices.slice(0, nTest);
      const trainPart = indices.slice(nTest);
      testIndices.push(...testPart);
      trainIndices.push(...trainPart);
    }
  });

  // If testIndices is empty but dataset has >= 5 samples,
  // hold out 1 sample from the room with the most samples (as long as it has >= 2)
  if (testIndices.length === 0 && recordings.length >= 5) {
    const roomsSortedByCount = Object.keys(byRoom)
      .filter((rId) => byRoom[rId].length >= 2)
      .sort((a, b) => byRoom[b].length - byRoom[a].length);

    if (roomsSortedByCount.length > 0) {
      const targetRoom = roomsSortedByCount[0];
      const idxInTrain = trainIndices.find((idx) => recordings[idx].roomId === targetRoom);
      if (idxInTrain !== undefined) {
        trainIndices.splice(trainIndices.indexOf(idxInTrain), 1);
        testIndices.push(idxInTrain);
      }
    }
  }

  const trainSet = trainIndices.map((i) => recordings[i]);
  const testSet = testIndices.map((i) => recordings[i]);

  return { trainSet, testSet };
}

/**
 * Stratified K-Fold Cross Validation.
 * Computes proper out-of-fold cross-validation accuracy across K folds.
 */
function evaluateCrossValidation(X, y, nEstimators = 40, maxDepth = 8, seed = 42) {
  const rng = createRng(seed);
  const nSamples = X.length;
  if (nSamples < 2) return 100.0;

  // Group sample indices by class
  const classIndices = {};
  y.forEach((label, idx) => {
    if (!classIndices[label]) classIndices[label] = [];
    classIndices[label].push(idx);
  });

  const uniqueClasses = Object.keys(classIndices);
  const minClassSize = Math.min(...uniqueClasses.map((c) => classIndices[c].length));
  let k = Math.min(5, Math.max(2, minClassSize >= 2 ? minClassSize : Math.floor(nSamples / Math.max(1, uniqueClasses.length))));
  if (k > nSamples) k = nSamples;
  if (k < 2) k = 2;

  // Distribute class indices into K folds
  const folds = Array.from({ length: k }, () => []);
  uniqueClasses.forEach((cls) => {
    const indices = [...classIndices[cls]];
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    indices.forEach((idx, i) => {
      folds[i % k].push(idx);
    });
  });

  let totalCorrect = 0;
  let totalEvaluated = 0;

  for (let f = 0; f < k; f++) {
    const valIndices = folds[f];
    const fitIndices = folds.filter((_, idx) => idx !== f).flat();

    if (valIndices.length === 0 || fitIndices.length === 0) continue;

    const fitX = fitIndices.map((i) => X[i]);
    const fitY = fitIndices.map((i) => y[i]);
    const valX = valIndices.map((i) => X[i]);
    const valY = valIndices.map((i) => y[i]);

    const foldTrees = [];
    for (let t = 0; t < nEstimators; t++) {
      const bootX = [];
      const bootY = [];
      for (let i = 0; i < fitX.length; i++) {
        const randIdx = Math.floor(rng() * fitX.length);
        bootX.push(fitX[randIdx]);
        bootY.push(fitY[randIdx]);
      }
      foldTrees.push(buildTree(bootX, bootY, 0, maxDepth));
    }

    for (let i = 0; i < valX.length; i++) {
      const votes = {};
      foldTrees.forEach((tree) => {
        const probs = predictTree(tree, valX[i]);
        Object.entries(probs).forEach(([roomId, prob]) => {
          votes[roomId] = (votes[roomId] || 0) + prob;
        });
      });
      const topRoom = Object.entries(votes).sort((a, b) => b[1] - a[1])[0]?.[0];
      if (topRoom === valY[i]) {
        totalCorrect++;
      }
      totalEvaluated++;
    }
  }

  const cvAcc = totalEvaluated > 0 ? (totalCorrect / totalEvaluated) * 100 : 0;
  return Number(cvAcc.toFixed(1));
}

/**
 * Auto-select the best hyperparameters by trying multiple combinations and picking
 * the one with the highest cross-validation score across the dataset.
 */
async function autoTune(allX, allY) {
  const configs = [
    { nEstimators: 30, maxDepth: 6 },
    { nEstimators: 50, maxDepth: 8 },
    { nEstimators: 80, maxDepth: 10 },
  ];

  let bestConfig = configs[1]; // Default
  let bestScore = -1;

  for (const config of configs) {
    const score = evaluateCrossValidation(allX, allY, config.nEstimators, config.maxDepth);
    if (score > bestScore) {
      bestScore = score;
      bestConfig = config;
    }
  }

  return { bestConfig, cvScore: bestScore };
}

/**
 * Core ML Pipeline Service for Indoor Localization
 */
class MLService {
  /**
   * Train model for a specific site with automatic hyperparameter tuning,
   * proper Stratified Cross-Validation on the full dataset, and final model
   * trained using 100% of the available dataset.
   */
  async trainSiteModel(siteId, organizationId, options = {}) {
    // Create a TrainingJob entry
    const job = await prisma.trainingJob.create({
      data: {
        organizationId,
        siteId,
        algorithm: 'RANDOM_FOREST_AUTO',
        status: 'RUNNING',
        startedAt: new Date(),
      },
    });

    try {
      // Fetch all recordings for this site
      const recordings = await prisma.fingerprintRecording.findMany({
        where: { siteId, organizationId },
        include: {
          room: {
            select: {
              id: true,
              name: true,
              floorId: true,
              floor: { select: { id: true, name: true, floorNumber: true } },
            },
          },
          floor: { select: { id: true, name: true, floorNumber: true } },
        },
      });

      if (recordings.length < 5) {
        throw new Error(
          `Not enough data: You have ${recordings.length} sample(s). Collect at least 5 samples across multiple rooms before training.`
        );
      }

      // Extract unique AP columns from 100% of the dataset
      const apSet = new Set();
      const roomsMap = new Map();

      recordings.forEach((r) => {
        const wifi = r.wifiData || {};
        Object.keys(wifi).forEach((k) => {
          const cleanKey = cleanAPKey(k);
          if (cleanKey) apSet.add(cleanKey);
        });

        if (!roomsMap.has(r.roomId)) {
          const floorName = r.room?.floor?.name || r.floor?.name || (r.floor?.floorNumber ? `Floor ${r.floor.floorNumber}` : 'Floor 1');
          const floorId = r.room?.floorId || r.floorId;
          const roomName = r.room ? r.room.name : 'Unknown Room';

          roomsMap.set(r.roomId, {
            roomId: r.roomId,
            roomName,
            floorId,
            floorName,
            samples: [],
          });
        }
        roomsMap.get(r.roomId).samples.push(r);
      });

      const featureColumns = Array.from(apSet).sort();
      const uniqueRooms = Array.from(roomsMap.values());

      if (uniqueRooms.length < 2) {
        throw new Error(
          'Need training data from at least 2 different rooms to train a location model. Collect samples in more rooms first.'
        );
      }

      // Construct feature matrix allX and label vector allY from 100% of the dataset
      const allX = recordings.map((r) => {
        const wifi = r.wifiData || {};
        return featureColumns.map((ap) => (wifi[ap] !== undefined ? Number(wifi[ap]) : MISSING_SIGNAL_RSSI));
      });
      const allY = recordings.map((r) => r.roomId);

      // Auto-tune hyperparameters using proper cross-validation (CV) on the full dataset
      const { bestConfig, cvScore } = await autoTune(allX, allY);
      const { nEstimators, maxDepth } = bestConfig;
      const cvAccuracy = Number(cvScore.toFixed(1));

      // Train final Random Forest using 100% of the available dataset
      const trees = [];
      const nTotal = allX.length;
      const trainRng = createRng(100);

      for (let t = 0; t < nEstimators; t++) {
        const bootX = [];
        const bootY = [];
        for (let i = 0; i < nTotal; i++) {
          const randIdx = Math.floor(trainRng() * nTotal);
          bootX.push(allX[randIdx]);
          bootY.push(allY[randIdx]);
        }
        trees.push(buildTree(bootX, bootY, 0, maxDepth));
      }

      // Compute Room Centroids from 100% of available dataset
      const roomArtifacts = {};
      uniqueRooms.forEach((rm) => {
        const centroidVector = {};
        const countVector = {};

        rm.samples.forEach((sample) => {
          const wifi = sample.wifiData || {};
          featureColumns.forEach((ap) => {
            const rawVal = wifi[ap];
            if (rawVal !== undefined && rawVal !== null && !isNaN(rawVal)) {
              centroidVector[ap] = (centroidVector[ap] || 0) + Number(rawVal);
              countVector[ap] = (countVector[ap] || 0) + 1;
            }
          });
        });

        const finalVector = {};
        featureColumns.forEach((ap) => {
          if (countVector[ap] && countVector[ap] > 0) {
            finalVector[ap] = Number((centroidVector[ap] / countVector[ap]).toFixed(2));
          } else {
            finalVector[ap] = MISSING_SIGNAL_RSSI;
          }
        });

        roomArtifacts[rm.roomId] = {
          roomId: rm.roomId,
          roomName: rm.roomName,
          floorId: rm.floorId,
          floorName: rm.floorName,
          sampleCount: rm.samples.length,
          centroid: finalVector,
        };
      });

      // Show CV score as the model's accuracy (not training accuracy)
      const metrics = {
        accuracy: cvAccuracy,
        cvAccuracy,
        totalSamples: recordings.length,
        trainSamples: recordings.length,
        uniqueApsCount: featureColumns.length,
        classesCount: uniqueRooms.length,
        nEstimators,
        maxDepth,
        autoTuned: true,
        evaluationMethod: 'Stratified Cross-Validation',
        roomBreakdown: uniqueRooms.map((r) => ({
          roomId: r.roomId,
          roomName: r.roomName,
          samples: r.samples.length,
        })),
      };

      // Serialized model artifact (pure plain objects — survives JSON round-trip)
      const modelArtifact = {
        version: 2,
        hyperparameters: { nEstimators, maxDepth },
        trees,
        rooms: roomArtifacts,
        metrics,
      };

      // Get next version number
      const lastModel = await prisma.modelVersion.findFirst({
        where: { siteId, organizationId },
        orderBy: { version: 'desc' },
      });
      const nextVersion = (lastModel?.version || 0) + 1;

      // Deactivate old models and save new
      const newModel = await prisma.$transaction(async (tx) => {
        await tx.modelVersion.updateMany({
          where: { siteId, organizationId, isActive: true },
          data: { isActive: false },
        });

        return await tx.modelVersion.create({
          data: {
            organizationId,
            siteId,
            version: nextVersion,
            algorithm: `Random Forest (${nEstimators} trees, depth ${maxDepth}, auto-tuned)`,
            featureColumns,
            modelArtifact,
            accuracy: cvAccuracy,
            sampleCount: recordings.length,
            isActive: true,
          },
        });
      });

      await prisma.trainingJob.update({
        where: { id: job.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          metrics,
          algorithm: `Random Forest (${nEstimators} trees, depth ${maxDepth}, auto-tuned)`,
        },
      });

      return {
        jobId: job.id,
        status: 'COMPLETED',
        modelVersion: newModel,
        metrics,
      };
    } catch (err) {
      console.error('Model training failed:', err);
      await prisma.trainingJob.update({
        where: { id: job.id },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          error: err.message,
        },
      });
      throw err;
    }
  }

  /**
   * Predict room / location using the active trained model
   */
  async predictLocation(siteId, organizationId, liveWifiData) {
    if (!liveWifiData || typeof liveWifiData !== 'object') {
      throw new Error('Wi-Fi scan data is required for prediction');
    }

    const activeModel = await prisma.modelVersion.findFirst({
      where: { siteId, organizationId, isActive: true },
    });

    if (!activeModel) {
      throw new Error('No trained model found for this site. Train a model first.');
    }

    const featureColumns = Array.isArray(activeModel.featureColumns) ? activeModel.featureColumns : [];
    const modelArtifact = activeModel.modelArtifact || {};
    const roomsMap = modelArtifact.rooms || {};
    const trees = Array.isArray(modelArtifact.trees) ? modelArtifact.trees : [];

    const roomIds = Object.keys(roomsMap);
    if (roomIds.length === 0) {
      throw new Error('Model has no room data. Please retrain.');
    }

    // Build feature row for live scan
    const liveRow = featureColumns.map((ap) =>
      liveWifiData[ap] !== undefined ? Number(liveWifiData[ap]) : MISSING_SIGNAL_RSSI
    );

    // Aggregate predictions from all trees (plain-object predictTree works after JSON parse)
    const votes = {};
    if (trees.length > 0) {
      trees.forEach((tree) => {
        const probs = predictTree(tree, liveRow);
        Object.entries(probs).forEach(([rId, prob]) => {
          votes[rId] = (votes[rId] || 0) + prob;
        });
      });
    }

    // Query active rooms and floors for this site to ensure live, up-to-date names
    const dbRooms = await prisma.room.findMany({
      where: { floor: { siteId } },
      include: { floor: true },
    });
    const dbRoomMap = new Map(dbRooms.map((r) => [r.id, r]));

    // Score all rooms
    const scoredRooms = roomIds.map((roomId) => {
      const rm = roomsMap[roomId];
      const dbRoom = dbRoomMap.get(roomId);
      const roomName = dbRoom?.name || rm.roomName || 'Unknown Room';
      const floorName = dbRoom?.floor?.name || rm.floorName || 'Floor 1';
      const floorId = dbRoom?.floorId || rm.floorId;

      let distSq = 0;
      let matchedAps = 0;

      featureColumns.forEach((ap) => {
        const liveRssi = liveWifiData[ap] !== undefined ? Number(liveWifiData[ap]) : MISSING_SIGNAL_RSSI;
        const targetRssi = rm.centroid ? (rm.centroid[ap] ?? MISSING_SIGNAL_RSSI) : MISSING_SIGNAL_RSSI;

        if (liveWifiData[ap] !== undefined) matchedAps++;

        const diff = liveRssi - targetRssi;
        distSq += diff * diff;
      });

      const distance = Number(Math.sqrt(distSq).toFixed(2));
      const treeScore = votes[roomId] ? votes[roomId] / Math.max(1, trees.length) : 0;
      const confidence = treeScore > 0 ? Math.min(99, Math.max(20, Math.round(treeScore * 100))) : 40;

      return {
        roomId,
        roomName,
        floorId,
        floorName,
        distance,
        treeScore: Number((treeScore * 100).toFixed(1)),
        confidence,
        probability: confidence,
        matchedAps,
      };
    });

    // Sort: highest tree score first, then lowest distance
    scoredRooms.sort((a, b) => {
      if (b.treeScore !== a.treeScore) return b.treeScore - a.treeScore;
      return a.distance - b.distance;
    });

    const bestMatch = scoredRooms[0];
    if (!bestMatch || bestMatch.matchedAps === 0) {
      return {
        siteId,
        modelVersion: activeModel.version,
        algorithm: activeModel.algorithm,
        prediction: null,
        message: 'No matching Wi-Fi access points detected for this building model',
        alternatives: [],
      };
    }

    const topConfidence = bestMatch.treeScore > 0
      ? Math.min(99, Math.max(55, Math.round(bestMatch.treeScore)))
      : 70;

    return {
      siteId,
      modelVersion: activeModel.version,
      algorithm: activeModel.algorithm,
      prediction: {
        roomId: bestMatch.roomId,
        roomName: bestMatch.roomName,
        floorId: bestMatch.floorId,
        floorName: bestMatch.floorName,
        confidence: topConfidence,
        distanceScore: bestMatch.distance,
        treeVote: `${bestMatch.treeScore}%`,
        matchedFeatures: bestMatch.matchedAps,
        totalModelFeatures: featureColumns.length,
      },
      alternatives: scoredRooms.slice(1, 4).map((alt) => ({
        roomId: alt.roomId,
        roomName: alt.roomName,
        floorId: alt.floorId,
        floorName: alt.floorName,
        confidence: alt.confidence,
        probability: alt.probability,
        distance: alt.distance,
      })),
    };
  }
}

export default new MLService();
