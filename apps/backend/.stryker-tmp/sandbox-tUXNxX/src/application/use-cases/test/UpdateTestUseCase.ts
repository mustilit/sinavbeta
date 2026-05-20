// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { IExamRepository } from '../../../domain/interfaces/IExamRepository';
import { IAuditLogRepository } from '../../../domain/interfaces/IAuditLogRepository';
import { IUserRepository } from '../../../domain/interfaces/IUserRepository';
import { AppError } from '../../errors/AppError';
import { ensureEducatorActive } from '../../policies/ensureEducatorActive';

/** Test metadata güncelleme (title, priceCents, duration, isTimed). Fiyat değişimi audit edilir. */
export class UpdateTestUseCase {
  constructor(private readonly examRepository: IExamRepository, private readonly auditRepository: IAuditLogRepository, private readonly userRepository: IUserRepository) {}
  async execute(testId: string, updates: {
    title?: string;
    priceCents?: number;
    duration?: number;
    isTimed?: boolean;
    hasSolutions?: boolean;
    campaignPriceCents?: number | null;
    campaignValidFrom?: Date | null;
    campaignValidUntil?: Date | null;
    coverImageUrl?: string | null;
  }, actorId?: string) {
    if (stryMutAct_9fa48("82")) {
      {}
    } else {
      stryCov_9fa48("82");
      if (stryMutAct_9fa48("84") ? false : stryMutAct_9fa48("83") ? true : (stryCov_9fa48("83", "84"), actorId)) {
        if (stryMutAct_9fa48("85")) {
          {}
        } else {
          stryCov_9fa48("85");
          const user = await this.userRepository.findById(actorId);
          if (stryMutAct_9fa48("88") ? false : stryMutAct_9fa48("87") ? true : stryMutAct_9fa48("86") ? user : (stryCov_9fa48("86", "87", "88"), !user)) throw new AppError(stryMutAct_9fa48("89") ? "" : (stryCov_9fa48("89"), 'USER_NOT_FOUND'), stryMutAct_9fa48("90") ? "" : (stryCov_9fa48("90"), 'User not found'), 404);
          ensureEducatorActive(user);
        }
      }
      const test = await this.examRepository.findById(testId);
      if (stryMutAct_9fa48("93") ? false : stryMutAct_9fa48("92") ? true : stryMutAct_9fa48("91") ? test : (stryCov_9fa48("91", "92", "93"), !test)) throw new AppError(stryMutAct_9fa48("94") ? "" : (stryCov_9fa48("94"), 'TEST_NOT_FOUND'), stryMutAct_9fa48("95") ? "" : (stryCov_9fa48("95"), 'Test not found'), 404);
      if (stryMutAct_9fa48("98") ? actorId && test.educatorId || test.educatorId !== actorId : stryMutAct_9fa48("97") ? false : stryMutAct_9fa48("96") ? true : (stryCov_9fa48("96", "97", "98"), (stryMutAct_9fa48("100") ? actorId || test.educatorId : stryMutAct_9fa48("99") ? true : (stryCov_9fa48("99", "100"), actorId && test.educatorId)) && (stryMutAct_9fa48("102") ? test.educatorId === actorId : stryMutAct_9fa48("101") ? true : (stryCov_9fa48("101", "102"), test.educatorId !== actorId)))) {
        if (stryMutAct_9fa48("103")) {
          {}
        } else {
          stryCov_9fa48("103");
          throw new AppError(stryMutAct_9fa48("104") ? "" : (stryCov_9fa48("104"), 'FORBIDDEN_NOT_OWNER'), stryMutAct_9fa48("105") ? "" : (stryCov_9fa48("105"), 'Only the educator who owns the test can update it'), 403);
        }
      }
      const oldPriceCents = stryMutAct_9fa48("106") ? (test as any).priceCents && null : (stryCov_9fa48("106"), (test as any).priceCents ?? null);
      const newPriceCents = updates.priceCents;
      const priceChanged = stryMutAct_9fa48("109") ? typeof newPriceCents === 'number' || newPriceCents !== oldPriceCents : stryMutAct_9fa48("108") ? false : stryMutAct_9fa48("107") ? true : (stryCov_9fa48("107", "108", "109"), (stryMutAct_9fa48("111") ? typeof newPriceCents !== 'number' : stryMutAct_9fa48("110") ? true : (stryCov_9fa48("110", "111"), typeof newPriceCents === (stryMutAct_9fa48("112") ? "" : (stryCov_9fa48("112"), 'number')))) && (stryMutAct_9fa48("114") ? newPriceCents === oldPriceCents : stryMutAct_9fa48("113") ? true : (stryCov_9fa48("113", "114"), newPriceCents !== oldPriceCents)));
      const updated = await this.examRepository.updateTestMetadata(testId, stryMutAct_9fa48("115") ? {} : (stryCov_9fa48("115"), {
        title: updates.title,
        priceCents: updates.priceCents,
        duration: updates.duration,
        isTimed: updates.isTimed,
        hasSolutions: updates.hasSolutions,
        campaignPriceCents: updates.campaignPriceCents,
        campaignValidFrom: updates.campaignValidFrom,
        campaignValidUntil: updates.campaignValidUntil,
        coverImageUrl: updates.coverImageUrl
      }));
      if (stryMutAct_9fa48("118") ? false : stryMutAct_9fa48("117") ? true : stryMutAct_9fa48("116") ? updated : (stryCov_9fa48("116", "117", "118"), !updated)) throw new AppError(stryMutAct_9fa48("119") ? "" : (stryCov_9fa48("119"), 'UPDATE_FAILED'), stryMutAct_9fa48("120") ? "" : (stryCov_9fa48("120"), 'Failed to update test'), 400);
      if (stryMutAct_9fa48("122") ? false : stryMutAct_9fa48("121") ? true : (stryCov_9fa48("121", "122"), priceChanged)) {
        if (stryMutAct_9fa48("123")) {
          {}
        } else {
          stryCov_9fa48("123");
          try {
            if (stryMutAct_9fa48("124")) {
              {}
            } else {
              stryCov_9fa48("124");
              await this.auditRepository.create(stryMutAct_9fa48("125") ? {} : (stryCov_9fa48("125"), {
                action: stryMutAct_9fa48("126") ? "" : (stryCov_9fa48("126"), 'PRICE_CHANGED'),
                entityType: stryMutAct_9fa48("127") ? "" : (stryCov_9fa48("127"), 'ExamTest'),
                entityId: testId,
                actorId: stryMutAct_9fa48("128") ? actorId && null : (stryCov_9fa48("128"), actorId ?? null),
                metadata: stryMutAct_9fa48("129") ? {} : (stryCov_9fa48("129"), {
                  oldPriceCents,
                  newPriceCents
                })
              }));
            }
          } catch {
            /* best-effort */
          }
        }
      }
      return updated;
    }
  }
}