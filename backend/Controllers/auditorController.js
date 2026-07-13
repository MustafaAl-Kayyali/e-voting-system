const Vote = require('../Models/voteModel');
const Election = require('../Models/electionModel');
const AuditLog = require('../Models/auditLogModel');
const Voter = require('../Models/voterModel');
const { createBlockchainHash, verifyVoteIntegrity } = require('../utils/authUtils');

const verifyDistributedRegisterIntegrity = async (req, res) => {
  try {
    const { electionId } = req.params;
    
    const election = await Election.findById(electionId)
      .populate('candidates', 'firstName lastName party');
    
    if (!election) {
      return res.status(404).json({
        status: 'fail',
        message: 'Election not found'
      });
    }

    const votes = await Vote.find({ election: electionId })
      .populate('voter', 'firstName lastName nationalId')
      .populate('candidate', 'firstName lastName party');

    let integrityResults = {
      totalVotes: votes.length,
      validVotes: 0,
      invalidVotes: 0,
      tamperedVotes: 0,
      blockchainVerified: 0,
      blockchainFailed: 0,
      issues: []
    };

    const voteIntegrityChecks = [];

    for (const vote of votes) {
      const voteCheck = {
        voteId: vote._id,
        receiptId: vote.receipt.id,
        timestamp: vote.createdAt,
        integrity: {
          hashValid: false,
          blockchainValid: false,
          dataIntact: false
        },
        issues: []
      };

      try {
        const hashValid = vote.verifyIntegrity();
        voteCheck.integrity.hashValid = hashValid;
        
        if (hashValid) {
          integrityResults.blockchainVerified++;
        } else {
          integrityResults.blockchainFailed++;
          voteCheck.issues.push('Vote hash integrity check failed');
          integrityResults.issues.push({
            type: 'hash_integrity_failure',
            voteId: vote._id,
            receiptId: vote.receipt.id
          });
        }

        const blockchainValid = verifyVoteIntegrity({
          voterId: vote.voter._id,
          electionId: vote.election,
          candidateId: vote.candidate._id,
          timestamp: vote.createdAt.getTime()
        }, vote.voteHash);

        voteCheck.integrity.blockchainValid = blockchainValid;

        if (vote.isValid) {
          integrityResults.validVotes++;
          voteCheck.integrity.dataIntact = true;
        } else {
          integrityResults.invalidVotes++;
          voteCheck.issues.push('Vote marked as invalid');
        }

        if (!hashValid || !blockchainValid || !vote.isValid) {
          integrityResults.tamperedVotes++;
        }

      } catch (error) {
        voteCheck.issues.push(`Integrity check error: ${error.message}`);
        integrityResults.issues.push({
          type: 'check_error',
          voteId: vote._id,
          error: error.message
        });
      }

      voteIntegrityChecks.push(voteCheck);
    }

    const overallIntegrity = {
      percentageValid: integrityResults.totalVotes > 0 ? 
        (integrityResults.validVotes / integrityResults.totalVotes) * 100 : 0,
      percentageBlockchainVerified: integrityResults.totalVotes > 0 ? 
        (integrityResults.blockchainVerified / integrityResults.totalVotes) * 100 : 0,
      hasTampering: integrityResults.tamperedVotes > 0,
      riskLevel: integrityResults.tamperedVotes === 0 ? 'low' : 
                 integrityResults.tamperedVotes < integrityResults.totalVotes * 0.01 ? 'medium' : 'high'
    };

    await AuditLog.create({
      eventType: 'admin_action',
      userId: req.user._id,
      userModel: 'Administrator',
      action: 'audit_integrity',
      description: `Distributed register integrity audit performed for election ${election.title}`,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      details: {
        electionId: election._id,
        auditResults: integrityResults,
        overallIntegrity,
        auditedAt: new Date()
      },
      severity: 'high',
      category: 'audit'
    });

    res.status(200).json({
      status: 'success',
      message: 'Distributed register integrity audit completed',
      data: {
        election: {
          id: election._id,
          title: election.title,
          totalVotes: election.totalVotes
        },
        integrityResults,
        overallIntegrity,
        detailedChecks: voteIntegrityChecks.slice(0, 100),
        auditMetadata: {
          auditedBy: req.user.firstName + ' ' + req.user.lastName,
          auditedAt: new Date(),
          totalChecked: voteIntegrityChecks.length
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error performing distributed register integrity audit',
      error: error.message
    });
  }
};

const getSystemLogs = async (req, res) => {
  try {
    const { 
      eventType, 
      category, 
      severity, 
      startDate, 
      endDate, 
      page = 1, 
      limit = 50 
    } = req.query;

    const filter = {};
    if (eventType) filter.eventType = eventType;
    if (category) filter.category = category;
    if (severity) filter.severity = severity;
    
    if (startDate || endDate) {
      filter.timestamp = {};
      if (startDate) filter.timestamp.$gte = new Date(startDate);
      if (endDate) filter.timestamp.$lte = new Date(endDate);
    }

    const logs = await AuditLog.find(filter)
      .populate('userId', 'firstName lastName username')
      .sort({ timestamp: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .select('-details.oldValue -details.newValue');

    const total = await AuditLog.countDocuments(filter);

    const anonymizedLogs = logs.map(log => ({
      id: log._id,
      eventType: log.eventType,
      action: log.action,
      description: log.description,
      timestamp: log.timestamp,
      success: log.success,
      severity: log.severity,
      category: log.category,
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      user: log.isAnonymous ? 'Anonymous' : {
        id: log.userId?._id,
        name: log.userId?.firstName + ' ' + log.userId?.lastName,
        model: log.userModel
      },
      details: {
        electionId: log.details?.electionId,
        candidateId: log.details?.candidateId,
        metadata: log.details?.metadata
      }
    }));

    res.status(200).json({
      status: 'success',
      results: anonymizedLogs.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      data: {
        logs: anonymizedLogs
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error fetching system logs',
      error: error.message
    });
  }
};

const generateAuditReport = async (req, res) => {
  try {
    const { electionId, reportType, startDate, endDate } = req.query;
    
    let reportData = {
      reportType,
      generatedAt: new Date(),
      generatedBy: req.user.firstName + ' ' + req.user.lastName,
      period: {
        startDate: startDate || null,
        endDate: endDate || new Date()
      }
    };

    if (reportType === 'election_audit' && electionId) {
      const election = await Election.findById(electionId)
        .populate('candidates', 'firstName lastName party')
        .populate('createdBy', 'firstName lastName');

      if (!election) {
        return res.status(404).json({
          status: 'fail',
          message: 'Election not found'
        });
      }

      const votes = await Vote.find({ election: electionId })
        .populate('voter', 'electoralDistrict')
        .populate('candidate', 'firstName lastName party');

      const voterTurnout = await Voter.countDocuments({
        votedInElections: { $elemMatch: { election: electionId } }
      });

      const eligibleVoters = await Voter.countDocuments({
        isWhitelisted: true,
        isVerified: true
      });

      reportData.election = {
        id: election._id,
        title: election.title,
        type: election.type,
        status: election.status,
        startDate: election.startDate,
        endDate: election.endDate,
        createdBy: election.createdBy.firstName + ' ' + election.createdBy.lastName
      };

      reportData.votingStatistics = {
        totalVotes: votes.length,
        validVotes: votes.filter(v => v.isValid).length,
        invalidVotes: votes.filter(v => !v.isValid).length,
        voterTurnout,
        eligibleVoters,
        turnoutPercentage: eligibleVoters > 0 ? (voterTurnout / eligibleVoters) * 100 : 0
      };

      reportData.candidateResults = election.results.map(result => ({
        candidate: result.candidate,
        votes: result.votes,
        percentage: result.percentage
      })).sort((a, b) => b.votes - a.votes);

      reportData.districtBreakdown = votes.reduce((acc, vote) => {
        const district = vote.voter.electoralDistrict;
        if (!acc[district]) {
          acc[district] = { totalVotes: 0, candidates: {} };
        }
        acc[district].totalVotes++;
        const candidateName = vote.candidate.firstName + ' ' + vote.candidate.lastName;
        acc[district].candidates[candidateName] = (acc[district].candidates[candidateName] || 0) + 1;
        return acc;
      }, {});

      reportData.votingMethods = votes.reduce((acc, vote) => {
        acc[vote.votingMethod] = (acc[vote.votingMethod] || 0) + 1;
        return acc;
      }, {});

      reportData.authenticationMethods = votes.reduce((acc, vote) => {
        acc[vote.authenticationMethod] = (acc[vote.authenticationMethod] || 0) + 1;
        return acc;
      }, {});

    } else if (reportType === 'system_audit') {
      const filter = {};
      if (startDate || endDate) {
        filter.timestamp = {};
        if (startDate) filter.timestamp.$gte = new Date(startDate);
        if (endDate) filter.timestamp.$lte = new Date(endDate);
      }

      const totalEvents = await AuditLog.countDocuments(filter);
      const failedEvents = await AuditLog.countDocuments({ ...filter, success: false });
      const securityEvents = await AuditLog.countDocuments({ ...filter, category: 'security' });
      const adminEvents = await AuditLog.countDocuments({ ...filter, category: 'administration' });

      const eventTypes = await AuditLog.aggregate([
        { $match: filter },
        { $group: { _id: '$eventType', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]);

      const severityBreakdown = await AuditLog.aggregate([
        { $match: filter },
        { $group: { _id: '$severity', count: { $sum: 1 } } }
      ]);

      reportData.systemStatistics = {
        totalEvents,
        failedEvents,
        successRate: totalEvents > 0 ? ((totalEvents - failedEvents) / totalEvents) * 100 : 0,
        securityEvents,
        adminEvents
      };

      reportData.eventTypeBreakdown = eventTypes;
      reportData.severityBreakdown = severityBreakdown;

      const peakActivity = await AuditLog.aggregate([
        { $match: filter },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d %H',
                date: '$timestamp'
              }
            },
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ]);

      reportData.peakActivityPeriods = peakActivity;
    }

    await AuditLog.create({
      eventType: 'admin_action',
      userId: req.user._id,
      userModel: 'Administrator',
      action: 'generate_audit_report',
      description: `Audit report generated: ${reportType}`,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      details: {
        reportType,
        reportData: reportData,
        generatedAt: new Date()
      },
      severity: 'medium',
      category: 'audit'
    });

    res.status(200).json({
      status: 'success',
      message: 'Audit report generated successfully',
      data: {
        report: reportData
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error generating audit report',
      error: error.message
    });
  }
};

const getVoterActivityAnalysis = async (req, res) => {
  try {
    const { electionId, timeRange } = req.query;
    
    let matchStage = {};
    if (electionId) {
      matchStage.election = electionId;
    }

    if (timeRange) {
      const now = new Date();
      let startTime;
      
      switch (timeRange) {
        case '24h':
          startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case '7d':
          startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        default:
          startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      }
      
      matchStage.createdAt = { $gte: startTime };
    }

    const votes = await Vote.find(matchStage)
      .populate('voter', 'electoralDistrict')
      .populate('election', 'title');

    const hourlyActivity = votes.reduce((acc, vote) => {
      const hour = new Date(vote.createdAt).getHours();
      acc[hour] = (acc[hour] || 0) + 1;
      return acc;
    }, {});

    const dailyActivity = votes.reduce((acc, vote) => {
      const day = new Date(vote.createdAt).toISOString().split('T')[0];
      acc[day] = (acc[day] || 0) + 1;
      return acc;
    }, {});

    const districtActivity = votes.reduce((acc, vote) => {
      const district = vote.voter.electoralDistrict;
      acc[district] = (acc[district] || 0) + 1;
      return acc;
    }, {});

    const peakVotingTime = Object.entries(hourlyActivity)
      .sort(([,a], [,b]) => b - a)[0];

    const peakVotingDay = Object.entries(dailyActivity)
      .sort(([,a], [,b]) => b - a)[0];

    const analysis = {
      totalVotes: votes.length,
      timeRange,
      hourlyBreakdown: hourlyActivity,
      dailyBreakdown: dailyActivity,
      districtBreakdown: districtActivity,
      peakVotingTime: peakVotingTime ? {
        hour: parseInt(peakVotingTime[0]),
        votes: peakVotingTime[1]
      } : null,
      peakVotingDay: peakVotingDay ? {
        date: peakVotingDay[0],
        votes: peakVotingDay[1]
      } : null,
      averageVotesPerHour: votes.length / 24,
      votingPatterns: {
        morningVotes: Object.entries(hourlyActivity)
          .filter(([hour]) => parseInt(hour) >= 6 && parseInt(hour) < 12)
          .reduce((sum, [,count]) => sum + count, 0),
        afternoonVotes: Object.entries(hourlyActivity)
          .filter(([hour]) => parseInt(hour) >= 12 && parseInt(hour) < 18)
          .reduce((sum, [,count]) => sum + count, 0),
        eveningVotes: Object.entries(hourlyActivity)
          .filter(([hour]) => parseInt(hour) >= 18 && parseInt(hour) < 24)
          .reduce((sum, [,count]) => sum + count, 0),
        nightVotes: Object.entries(hourlyActivity)
          .filter(([hour]) => parseInt(hour) >= 0 && parseInt(hour) < 6)
          .reduce((sum, [,count]) => sum + count, 0)
      }
    };

    res.status(200).json({
      status: 'success',
      data: {
        analysis
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error analyzing voter activity',
      error: error.message
    });
  }
};

const getSystemPerformanceMetrics = async (req, res) => {
  try {
    const { timeRange } = req.query;
    
    let startTime;
    const now = new Date();
    
    switch (timeRange) {
      case '1h':
        startTime = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case '24h':
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      default:
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    const totalEvents = await AuditLog.countDocuments({
      timestamp: { $gte: startTime }
    });

    const errorEvents = await AuditLog.countDocuments({
      timestamp: { $gte: startTime },
      success: false
    });

    const securityEvents = await AuditLog.countDocuments({
      timestamp: { $gte: startTime },
      category: 'security'
    });

    const voteEvents = await AuditLog.countDocuments({
      timestamp: { $gte: startTime },
      eventType: 'vote_cast'
    });

    const authenticationEvents = await AuditLog.countDocuments({
      timestamp: { $gte: startTime },
      eventType: { $in: ['user_login', 'user_logout'] }
    });

    const responseTimeMetrics = await AuditLog.aggregate([
      { $match: { timestamp: { $gte: startTime } } },
      {
        $group: {
          _id: null,
          avgResponseTime: { $avg: '$details.metadata.responseTime' },
          maxResponseTime: { $max: '$details.metadata.responseTime' },
          minResponseTime: { $min: '$details.metadata.responseTime' }
        }
      }
    ]);

    const eventFrequency = await AuditLog.aggregate([
      { $match: { timestamp: { $gte: startTime } } },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d %H:%M',
              date: '$timestamp'
            }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const metrics = {
      timeRange,
      period: {
        start: startTime,
        end: now,
        duration: now - startTime
      },
      eventMetrics: {
        totalEvents,
        errorEvents,
        errorRate: totalEvents > 0 ? (errorEvents / totalEvents) * 100 : 0,
        securityEvents,
        voteEvents,
        authenticationEvents
      },
      performanceMetrics: responseTimeMetrics[0] || {
        avgResponseTime: 0,
        maxResponseTime: 0,
        minResponseTime: 0
      },
      eventFrequency,
      systemHealth: {
        status: errorEvents < totalEvents * 0.05 ? 'healthy' : 
               errorEvents < totalEvents * 0.15 ? 'warning' : 'critical',
        uptime: 99.9,
        lastError: await AuditLog.findOne({
          timestamp: { $gte: startTime },
          success: false
        }).sort({ timestamp: -1 }).select('timestamp description')
      }
    };

    res.status(200).json({
      status: 'success',
      data: {
        metrics
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error fetching system performance metrics',
      error: error.message
    });
  }
};

module.exports = {
  verifyDistributedRegisterIntegrity,
  getSystemLogs,
  generateAuditReport,
  getVoterActivityAnalysis,
  getSystemPerformanceMetrics
};
