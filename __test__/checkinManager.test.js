// __tests__/checkinManager.test.js
import {jest, describe, it, expect, beforeEach, afterEach} from '@jest/globals';
import {fileURLToPath} from 'url';
import path from 'path';
import fs from 'fs/promises';
import {CheckinManager} from '../utils/checkinManager.js';
import {logger} from '../utils/logger.js';

// 현재 파일의 __dirname 설정 (ES 모듈에서는 __dirname이 기본적으로 없음)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

logger.info = jest.fn();
logger.error = jest.fn();
logger.warn = jest.fn();
logger.debug = jest.fn();

describe('CheckinManager Timezone Tests', () => {
    let checkinManager;
    const userId = 'test-user-123';

    beforeEach(async () => {
        jest.useFakeTimers();
        // Mock 초기화
        jest.clearAllMocks();

        checkinManager = new CheckinManager();

        // Mock 파일 시스템 작업
        jest.spyOn(checkinManager, 'loadResetTimes').mockResolvedValue({});
        jest.spyOn(checkinManager, 'saveResetTimes').mockResolvedValue();
        jest.spyOn(checkinManager, 'loadPendingResets').mockResolvedValue({});
        jest.spyOn(checkinManager, 'savePendingResets').mockResolvedValue();
        jest.spyOn(checkinManager, 'loadCheckins').mockResolvedValue({});
        jest.spyOn(checkinManager, 'saveCheckins').mockResolvedValue();
        jest.spyOn(fs, 'access').mockResolvedValue();

        // ensureDataDirectory 초기화 기다리기
        await checkinManager.ensureDataDirectory();
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.clearAllMocks();
    });

    describe('3일 제한 테스트', () => {
        it('처음 시간 변경은 성공해야 함', async () => {
            const timeCheck = await checkinManager.canUpdateResetHour(userId);
            expect(timeCheck.canUpdate).toBe(true);
        });

        it('3일 이내 재변경 시도는 실패해야 함', async () => {
            // Mock: 2일 전에 변경한 기록
            jest.spyOn(checkinManager, 'loadResetTimes').mockResolvedValue({
                [userId]: {
                    hour: 9,
                    lastUpdate: Date.now() - 2 * 24 * 60 * 60 * 1000
                }
            });

            const timeCheck = await checkinManager.canUpdateResetHour(userId);
            expect(timeCheck.canUpdate).toBe(false);
            expect(timeCheck.nextAvailable).toBeDefined();
        });

        it('3일 이후 재변경은 성공해야 함', async () => {
            // Mock: 4일 전에 변경한 기록
            jest.spyOn(checkinManager, 'loadResetTimes').mockResolvedValue({
                [userId]: {
                    hour: 9,
                    lastUpdate: Date.now() - 4 * 24 * 60 * 60 * 1000
                }
            });

            const timeCheck = await checkinManager.canUpdateResetHour(userId);
            expect(timeCheck.canUpdate).toBe(true);
        });
    });

    describe('시간 변경 예약 테스트', () => {
        beforeEach(() => {
            // 2024-01-13 14:00 KST (05:00 UTC)로 시간 고정
            jest.setSystemTime(new Date('2024-01-13T05:00:00Z'));
        });

        it('다음날에 시간이 변경되어야 함', async () => {
            const result = await checkinManager.updateUserResetHour(userId, 16);

            expect(result.previousHour).toBe(0); // 기본값
            expect(result.newHour).toBe(16);

            // 예상: 다음날 16시 KST (07:00 UTC)
            const expectedDate = new Date('2024-01-14T07:00:00Z');
            expect(result.effectiveDate.getTime()).toBe(expectedDate.getTime());
        });

        it('현재 체크인은 기존 시간을 유지해야 함', async () => {
            // 시간 변경
            await checkinManager.updateUserResetHour(userId, 16);

            // 현재 체크인 확인
            const today = await checkinManager.getTodayByUser(userId);
            expect(today).toBe('2024-01-13');

            // 체크인 생성 가능 여부 확인
            const existingCheckin = await checkinManager.getTodayCheckin(userId);
            expect(existingCheckin).toBeNull(); // 아직 체크인 없음
        });
    });

    describe('체크인 진행중 시간대 테스트', () => {
        beforeEach(() => {
            // 2024-01-13 14:00 KST로 시간 고정
            jest.setSystemTime(new Date('2024-01-13T05:00:00Z'));
        });

        it('진행중인 체크인이 있을 때 getTodayByUser가 올바른 날짜를 반환해야 함', async () => {
            // Mock: 현재 진행중인 체크인
            jest.spyOn(checkinManager, 'loadCheckins').mockResolvedValue({
                [userId]: [{
                    date: '2024-01-13',
                    tasks: []
                }]
            });

            // 16시로 시간 변경
            await checkinManager.updateUserResetHour(userId, 16);

            // 현재 날짜 확인
            const today = await checkinManager.getTodayByUser(userId);
            expect(today).toBe('2024-01-13');
        });

        it('체크인 완료 여부 확인이 정상 작동해야 함', async () => {
            // Mock: 현재 진행중인 체크인
            const mockCheckins = {
                [userId]: [{
                    date: '2024-01-13',
                    tasks: [
                        {id: 1, content: 'Task 1', completed: false}
                    ]
                }]
            };
            jest.spyOn(checkinManager, 'loadCheckins').mockResolvedValue(mockCheckins);

            // 16시로 변경 후 테스트
            await checkinManager.updateUserResetHour(userId, 16);
            const result = await checkinManager.toggleTaskComplete(userId, 1);

            expect(result.completed).toBe(true);
        });
    });

    describe('시간대 변경 후 새 체크인 테스트', () => {
        it('변경된 시간이 지난 후 새로운 체크인은 새 시간대로 생성되어야 함', async () => {
            // Mock checkins
            const mockCheckins = {};
            jest.spyOn(checkinManager, 'loadCheckins').mockResolvedValue(mockCheckins);

            // 1. 14시에 시간 변경
            jest.setSystemTime(new Date('2024-01-13T05:00:00Z')); // 14:00 KST
            await checkinManager.updateUserResetHour(userId, 16);

            // 2. 다음날 17시로 시간 이동 (변경된 시간 이후)
            jest.setSystemTime(new Date('2024-01-14T08:00:00Z')); // 17:00 KST

            // 3. 새 체크인 생성
            const newCheckin = await checkinManager.createCheckin(userId, ['New Task']);

            // 4. 결과 확인
            expect(newCheckin.date).toBe('2024-01-14');

            // 5. 로그 호출 확인
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('체크인 생성 완료'));
        });
    });
});

describe('체크인 시간 변경 시나리오 테스트', () => {
    let checkinManager;
    const userId = 'test-user-123';
    let mockCheckins = {};

    beforeEach(async () => {
        jest.useFakeTimers();
        checkinManager = new CheckinManager();

        // Mock 파일 시스템 작업
        jest.spyOn(checkinManager, 'loadResetTimes').mockResolvedValue({});
        jest.spyOn(checkinManager, 'saveResetTimes').mockResolvedValue();
        jest.spyOn(checkinManager, 'loadPendingResets').mockResolvedValue({});
        jest.spyOn(checkinManager, 'savePendingResets').mockResolvedValue();

        // checkins mock을 동적으로 관리하기 위한 설정
        jest.spyOn(checkinManager, 'loadCheckins').mockImplementation(() => Promise.resolve(mockCheckins));
        jest.spyOn(checkinManager, 'saveCheckins').mockImplementation((checkins) => {
            mockCheckins = checkins;
            return Promise.resolve();
        });
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.clearAllMocks();
        mockCheckins = {};
    });

    it('시간 변경 전후의 체크인 시나리오', async () => {
        // 1. 1/13일 14시에 체크인 생성
        jest.setSystemTime(new Date('2024-01-13T05:00:00Z')); // 14:00 KST
        const initialCheckin = await checkinManager.createCheckin(userId, [
            'Task 1',
            'Task 2'
        ]);
        expect(initialCheckin.date).toBe('2024-01-13');
        expect(initialCheckin.tasks).toHaveLength(2);

        // 2. 1/13일 14시 5분에 시간대 15시로 변경
        jest.setSystemTime(new Date('2024-01-13T05:05:00Z')); // 14:05 KST
        const timeChangeResult = await checkinManager.updateUserResetHour(userId, 15);
        expect(timeChangeResult.newHour).toBe(15);

        // 3. 같은 날 14:10에 Task 1 완료 처리
        jest.setSystemTime(new Date('2024-01-13T05:10:00Z')); // 14:10 KST
        const completedTask1 = await checkinManager.toggleTaskComplete(userId, 1);
        expect(completedTask1.completed).toBe(true);

        // 4. 다음날 6시에 Task 2 완료 처리
        jest.setSystemTime(new Date('2024-01-13T21:00:00Z')); // 다음날 06:00 KST
        const completedTask2 = await checkinManager.toggleTaskComplete(userId, 2);
        expect(completedTask2.completed).toBe(true);

        // 5. 다음날 7시에 체크인 생성 시도
        jest.setSystemTime(new Date('2024-01-13T22:00:00Z')); // 다음날 07:00 KST
        const todayCheckin = await checkinManager.getTodayCheckin(userId);
        expect(todayCheckin).not.toBeNull(); // 아직 13일의 체크인이 유효해야 함
        expect(todayCheckin.date).toBe('2024-01-13');

        // 6. 다음날 15시(새로운 초기화 시간 이후)에 체크인 생성
        jest.setSystemTime(new Date('2024-01-14T06:00:00Z')); // 다음날 15:00 KST
        const newCheckin = await checkinManager.createCheckin(userId, ['New Task']);
        expect(newCheckin.date).toBe('2024-01-14');

        // 최종 상태 확인
        const allCheckins = await checkinManager.getAllCheckins(userId);
        expect(allCheckins).toHaveLength(2);

        // 13일 체크인의 task들이 모두 완료 상태인지 확인
        const jan13Checkin = allCheckins.find(c => c.date === '2024-01-13');
        expect(jan13Checkin.tasks[0].completed).toBe(true);
        expect(jan13Checkin.tasks[1].completed).toBe(true);

        // 14일 체크인이 정상적으로 생성되었는지 확인
        const jan14Checkin = allCheckins.find(c => c.date === '2024-01-14');
        expect(jan14Checkin.tasks[0].content).toBe('New Task');
        expect(jan14Checkin.tasks[0].completed).toBe(false);
    });
});

describe('Streak 계산 테스트', () => {
    let checkinManager;
    const userId = 'test-user-123';
    let mockCheckins = {};

    beforeEach(async () => {
        jest.useFakeTimers();
        checkinManager = new CheckinManager();

        // Mock 파일 시스템 작업
        jest.spyOn(checkinManager, 'loadResetTimes').mockResolvedValue({});
        jest.spyOn(checkinManager, 'saveResetTimes').mockResolvedValue();
        jest.spyOn(checkinManager, 'loadPendingResets').mockResolvedValue({});
        jest.spyOn(checkinManager, 'savePendingResets').mockResolvedValue();

        // checkins mock을 동적으로 관리
        jest.spyOn(checkinManager, 'loadCheckins').mockImplementation(() => Promise.resolve(mockCheckins));
        jest.spyOn(checkinManager, 'saveCheckins').mockImplementation((checkins) => {
            mockCheckins = checkins;
            return Promise.resolve();
        });
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.clearAllMocks();
        mockCheckins = {};
    });

    describe('기본 streak 계산', () => {
        it('체크인이 없을 때 streak은 0이어야 함', async () => {
            const streak = await checkinManager.calculateStreak(userId);
            expect(streak).toBe(0);
        });

        it('첫 체크인의 streak은 1이어야 함', async () => {
            // 현재 시각 설정
            jest.setSystemTime(new Date('2024-01-13T05:00:00Z')); // 14:00 KST

            await checkinManager.createCheckin(userId, ['Task 1']);
            const streak = await checkinManager.calculateStreak(userId);
            expect(streak).toBe(1);
        });

        it('연속된 3일의 체크인은 streak 3을 반환해야 함', async () => {
            mockCheckins = {
                [userId]: [
                    {
                        date: '2024-01-13',
                        tasks: [{ id: 1, content: 'Task 1', completed: false }]
                    },
                    {
                        date: '2024-01-12',
                        tasks: [{ id: 1, content: 'Task 1', completed: true }]
                    },
                    {
                        date: '2024-01-11',
                        tasks: [{ id: 1, content: 'Task 1', completed: true }]
                    }
                ]
            };

            jest.setSystemTime(new Date('2024-01-13T05:00:00Z')); // 14:00 KST
            const streak = await checkinManager.calculateStreak(userId);
            expect(streak).toBe(3);
        });
    });

    describe('streak 이어짐/끊김 시나리오', () => {
        it('하루를 건너뛰면 streak이 끊어져야 함', async () => {
            mockCheckins = {
                [userId]: [
                    {
                        date: '2024-01-13',
                        tasks: [{ id: 1, content: 'Task 1', completed: false }]
                    },
                    {
                        date: '2024-01-11',
                        tasks: [{ id: 1, content: 'Task 1', completed: true }]
                    }
                ]
            };

            jest.setSystemTime(new Date('2024-01-13T05:00:00Z'));
            const streak = await checkinManager.calculateStreak(userId);
            expect(streak).toBe(1); // 중간에 12일이 없으므로 13일 하루만 카운트
        });

        it('오늘 체크인이 없으면 streak이 0이어야 함', async () => {
            mockCheckins = {
                [userId]: [
                    {
                        date: '2024-01-12',
                        tasks: [{ id: 1, content: 'Task 1', completed: true }]
                    },
                    {
                        date: '2024-01-11',
                        tasks: [{ id: 1, content: 'Task 1', completed: true }]
                    }
                ]
            };

            jest.setSystemTime(new Date('2024-01-13T05:00:00Z'));
            const streak = await checkinManager.calculateStreak(userId);
            expect(streak).toBe(0);
        });
    });

    describe('최장 streak 계산', () => {
        it('전체 기록 중 최장 연속 기록을 반환해야 함', async () => {
            mockCheckins = {
                [userId]: [
                    // 현재 진행중인 3일 연속
                    {
                        date: '2024-01-13',
                        tasks: [{ id: 1, content: 'Task 1', completed: false }]
                    },
                    {
                        date: '2024-01-12',
                        tasks: [{ id: 1, content: 'Task 1', completed: true }]
                    },
                    {
                        date: '2024-01-11',
                        tasks: [{ id: 1, content: 'Task 1', completed: true }]
                    },
                    // 1일 간격
                    {
                        date: '2024-01-09',
                        tasks: [{ id: 1, content: 'Task 1', completed: true }]
                    },
                    // 과거의 5일 연속
                    {
                        date: '2024-01-07',
                        tasks: [{ id: 1, content: 'Task 1', completed: true }]
                    },
                    {
                        date: '2024-01-06',
                        tasks: [{ id: 1, content: 'Task 1', completed: true }]
                    },
                    {
                        date: '2024-01-05',
                        tasks: [{ id: 1, content: 'Task 1', completed: true }]
                    },
                    {
                        date: '2024-01-04',
                        tasks: [{ id: 1, content: 'Task 1', completed: true }]
                    },
                    {
                        date: '2024-01-03',
                        tasks: [{ id: 1, content: 'Task 1', completed: true }]
                    }
                ]
            };

            jest.setSystemTime(new Date('2024-01-13T05:00:00Z'));
            const maxStreak = await checkinManager.calculateMaxStreak(userId);
            const currentStreak = await checkinManager.calculateStreak(userId);

            expect(maxStreak).toBe(5); // 1/3 ~ 1/7의 5일 연속이 최장 기록
            expect(currentStreak).toBe(3); // 현재 1/11 ~ 1/13의 3일 연속 진행중
        });
    });

    describe('시간대 변경과 streak 계산', () => {
        it('시간대 변경 후에도 streak이 정상적으로 계산되어야 함', async () => {
            // 1. 14시에 첫 체크인
            jest.setSystemTime(new Date('2024-01-13T05:00:00Z')); // 14:00 KST
            await checkinManager.createCheckin(userId, ['Task 1']);

            // 2. 15시로 시간대 변경
            await checkinManager.updateUserResetHour(userId, 15);

            // 3. 다음날 14시 (아직 초기화 전)
            jest.setSystemTime(new Date('2024-01-14T05:00:00Z')); // 다음날 14:00 KST
            let streak = await checkinManager.calculateStreak(userId);
            expect(streak).toBe(1); // 아직 13일의 체크인이 유효

            // 4. 다음날 16시 (초기화 후)
            jest.setSystemTime(new Date('2024-01-14T07:00:00Z')); // 다음날 16:00 KST
            await checkinManager.createCheckin(userId, ['New Task']);
            streak = await checkinManager.calculateStreak(userId);
            expect(streak).toBe(2); // 두 날의 체크인 모두 카운트
        });
    });
});