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
import { IExamTypeRepository } from '../../../domain/interfaces/IExamTypeRepository';
import { ITopicRepository } from '../../../domain/interfaces/ITopicRepository';
import { ExamTest, ExamQuestion } from '../../../domain/entities/Exam';
import { AppError } from '../../errors/AppError';
import { randomUUID } from 'crypto';
import { prisma } from '../../../infrastructure/database/prisma';
const UUID_REGEX = stryMutAct_9fa48("13") ? /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[^0-9a-f]{12}$/i : stryMutAct_9fa48("12") ? /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]$/i : stryMutAct_9fa48("11") ? /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][^0-9a-f]{3}-[0-9a-f]{12}$/i : stryMutAct_9fa48("10") ? /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]-[0-9a-f]{12}$/i : stryMutAct_9fa48("9") ? /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[^89ab][0-9a-f]{3}-[0-9a-f]{12}$/i : stryMutAct_9fa48("8") ? /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][^0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i : stryMutAct_9fa48("7") ? /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i : stryMutAct_9fa48("6") ? /^[0-9a-f]{8}-[0-9a-f]{4}-[^1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i : stryMutAct_9fa48("5") ? /^[0-9a-f]{8}-[^0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i : stryMutAct_9fa48("4") ? /^[0-9a-f]{8}-[0-9a-f]-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i : stryMutAct_9fa48("3") ? /^[^0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i : stryMutAct_9fa48("2") ? /^[0-9a-f]-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i : stryMutAct_9fa48("1") ? /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i : stryMutAct_9fa48("0") ? /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i : (stryCov_9fa48("0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13"), /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
export class CreateTestUseCase {
  constructor(private readonly examRepository: IExamRepository, private readonly examTypeRepository: IExamTypeRepository, private readonly topicRepository: ITopicRepository) {}
  async execute(input: {
    title: string;
    isTimed?: boolean;
    duration?: number;
    price?: number;
    educatorId?: string;
    examTypeId?: string | null;
    topicId?: string | null;
    questions?: (ExamQuestion & {
      options: any[];
    })[];
  }) {
    if (stryMutAct_9fa48("14")) {
      {}
    } else {
      stryCov_9fa48("14");
      // Kill-switch: package/test creation disabled
      const settings = await prisma.adminSettings.findFirst(stryMutAct_9fa48("15") ? {} : (stryCov_9fa48("15"), {
        where: stryMutAct_9fa48("16") ? {} : (stryCov_9fa48("16"), {
          id: 1
        })
      }));
      if (stryMutAct_9fa48("19") ? settings || settings.packageCreationEnabled === false : stryMutAct_9fa48("18") ? false : stryMutAct_9fa48("17") ? true : (stryCov_9fa48("17", "18", "19"), settings && (stryMutAct_9fa48("21") ? settings.packageCreationEnabled !== false : stryMutAct_9fa48("20") ? true : (stryCov_9fa48("20", "21"), settings.packageCreationEnabled === (stryMutAct_9fa48("22") ? true : (stryCov_9fa48("22"), false)))))) {
        if (stryMutAct_9fa48("23")) {
          {}
        } else {
          stryCov_9fa48("23");
          throw new AppError(stryMutAct_9fa48("24") ? "" : (stryCov_9fa48("24"), 'PACKAGE_CREATION_DISABLED'), stryMutAct_9fa48("25") ? "" : (stryCov_9fa48("25"), 'Test oluşturma geçici olarak durdurulmuştur'), 503);
        }
      }
      let examTypeId: string | null = stryMutAct_9fa48("26") ? input.examTypeId && null : (stryCov_9fa48("26"), input.examTypeId ?? null);
      let topicId: string | null = stryMutAct_9fa48("27") ? input.topicId && null : (stryCov_9fa48("27"), input.topicId ?? null);

      // If topicId given but no examTypeId: set examTypeId from topic
      if (stryMutAct_9fa48("30") ? topicId || !examTypeId : stryMutAct_9fa48("29") ? false : stryMutAct_9fa48("28") ? true : (stryCov_9fa48("28", "29", "30"), topicId && (stryMutAct_9fa48("31") ? examTypeId : (stryCov_9fa48("31"), !examTypeId)))) {
        if (stryMutAct_9fa48("32")) {
          {}
        } else {
          stryCov_9fa48("32");
          const topic = await this.topicRepository.findById(topicId);
          if (stryMutAct_9fa48("35") ? false : stryMutAct_9fa48("34") ? true : stryMutAct_9fa48("33") ? topic : (stryCov_9fa48("33", "34", "35"), !topic)) {
            if (stryMutAct_9fa48("36")) {
              {}
            } else {
              stryCov_9fa48("36");
              throw new AppError(stryMutAct_9fa48("37") ? "" : (stryCov_9fa48("37"), 'TOPIC_NOT_FOUND'), stryMutAct_9fa48("38") ? "" : (stryCov_9fa48("38"), 'Topic not found'), 404);
            }
          }
          examTypeId = topic.examTypeId;
        }
      }

      // If examTypeId given: must exist
      if (stryMutAct_9fa48("40") ? false : stryMutAct_9fa48("39") ? true : (stryCov_9fa48("39", "40"), examTypeId)) {
        if (stryMutAct_9fa48("41")) {
          {}
        } else {
          stryCov_9fa48("41");
          if (stryMutAct_9fa48("44") ? false : stryMutAct_9fa48("43") ? true : stryMutAct_9fa48("42") ? UUID_REGEX.test(examTypeId) : (stryCov_9fa48("42", "43", "44"), !UUID_REGEX.test(examTypeId))) {
            if (stryMutAct_9fa48("45")) {
              {}
            } else {
              stryCov_9fa48("45");
              throw new AppError(stryMutAct_9fa48("46") ? "" : (stryCov_9fa48("46"), 'INVALID_UUID'), stryMutAct_9fa48("47") ? "" : (stryCov_9fa48("47"), 'Invalid examTypeId'), 400);
            }
          }
          const examType = await this.examTypeRepository.findById(examTypeId);
          if (stryMutAct_9fa48("50") ? false : stryMutAct_9fa48("49") ? true : stryMutAct_9fa48("48") ? examType : (stryCov_9fa48("48", "49", "50"), !examType)) {
            if (stryMutAct_9fa48("51")) {
              {}
            } else {
              stryCov_9fa48("51");
              throw new AppError(stryMutAct_9fa48("52") ? "" : (stryCov_9fa48("52"), 'EXAMTYPE_NOT_FOUND'), stryMutAct_9fa48("53") ? "" : (stryCov_9fa48("53"), 'Exam type not found'), 404);
            }
          }
        }
      }

      // If topicId given: must exist and topic.examTypeId must match examTypeId
      if (stryMutAct_9fa48("55") ? false : stryMutAct_9fa48("54") ? true : (stryCov_9fa48("54", "55"), topicId)) {
        if (stryMutAct_9fa48("56")) {
          {}
        } else {
          stryCov_9fa48("56");
          if (stryMutAct_9fa48("59") ? false : stryMutAct_9fa48("58") ? true : stryMutAct_9fa48("57") ? UUID_REGEX.test(topicId) : (stryCov_9fa48("57", "58", "59"), !UUID_REGEX.test(topicId))) {
            if (stryMutAct_9fa48("60")) {
              {}
            } else {
              stryCov_9fa48("60");
              throw new AppError(stryMutAct_9fa48("61") ? "" : (stryCov_9fa48("61"), 'INVALID_UUID'), stryMutAct_9fa48("62") ? "" : (stryCov_9fa48("62"), 'Invalid topicId'), 400);
            }
          }
          const topic = await this.topicRepository.findById(topicId);
          if (stryMutAct_9fa48("65") ? false : stryMutAct_9fa48("64") ? true : stryMutAct_9fa48("63") ? topic : (stryCov_9fa48("63", "64", "65"), !topic)) {
            if (stryMutAct_9fa48("66")) {
              {}
            } else {
              stryCov_9fa48("66");
              throw new AppError(stryMutAct_9fa48("67") ? "" : (stryCov_9fa48("67"), 'TOPIC_NOT_FOUND'), stryMutAct_9fa48("68") ? "" : (stryCov_9fa48("68"), 'Topic not found'), 404);
            }
          }
          if (stryMutAct_9fa48("71") ? examTypeId || topic.examTypeId !== examTypeId : stryMutAct_9fa48("70") ? false : stryMutAct_9fa48("69") ? true : (stryCov_9fa48("69", "70", "71"), examTypeId && (stryMutAct_9fa48("73") ? topic.examTypeId === examTypeId : stryMutAct_9fa48("72") ? true : (stryCov_9fa48("72", "73"), topic.examTypeId !== examTypeId)))) {
            if (stryMutAct_9fa48("74")) {
              {}
            } else {
              stryCov_9fa48("74");
              throw new AppError(stryMutAct_9fa48("75") ? "" : (stryCov_9fa48("75"), 'TOPIC_EXAMTYPE_MISMATCH'), stryMutAct_9fa48("76") ? "" : (stryCov_9fa48("76"), 'Topic does not belong to the given exam type'), 409);
            }
          }
        }
      }
      const id = randomUUID();
      const test: ExamTest = {
        id,
        title: input.title,
        isTimed: !!input.isTimed,
        duration: input.duration ?? null,
        status: 'DRAFT',
        educatorId: input.educatorId ?? null,
        examTypeId: examTypeId ?? undefined,
        topicId: topicId ?? undefined,
        metadata: {},
        price: input.price,
        publishedAt: null,
        createdAt: new Date(),
        updatedAt: new Date()
      } as any;
      const questions = (stryMutAct_9fa48("77") ? input.questions && [] : (stryCov_9fa48("77"), input.questions ?? (stryMutAct_9fa48("78") ? ["Stryker was here"] : (stryCov_9fa48("78"), [])))).map(stryMutAct_9fa48("79") ? () => undefined : (stryCov_9fa48("79"), q => stryMutAct_9fa48("80") ? {} : (stryCov_9fa48("80"), {
        ...q,
        id: stryMutAct_9fa48("81") ? q.id && randomUUID() : (stryCov_9fa48("81"), q.id ?? randomUUID())
      })));
      return this.examRepository.save(test, questions);
    }
  }
}