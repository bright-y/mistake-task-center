const practiceDefaults = {
  questionsPerMistake: 2,
  difficulty: 'standard',
  questionType: 'mixed',
  includeHistory: true
};

const demoStudents = [
  { id: 'stu-001', name: '李明', practiceCount: 4, accuracy: 83, weakPoint: '绝对值方程', activity: '今天 10:24' },
  { id: 'stu-002', name: '陈思远', practiceCount: 3, accuracy: 76, weakPoint: '平行线与角', activity: '今天 09:50' },
  { id: 'stu-003', name: '周可欣', practiceCount: 5, accuracy: 91, weakPoint: '整式加减', activity: '昨天 18:12' }
];

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function ensureDemoState() {
  state.practiceSettings = { ...practiceDefaults, ...(state.practiceSettings || {}) };
  state.task.sourceImageDataUrl ||= '';
  state.task.imageRotation ||= 0;
  state.task.uploadProgress ||= 0;
  state.task.uploadError ||= '';
  state.handwritingByItem ||= {};
  state.reviewFilters ||= { student: 'all', knowledge: 'all', conflict: 'all', confidence: 'all' };
  state.assignment ||= { audience: 'class', knowledgePoints: ['绝对值方程', '一元一次方程'], count: '6', difficulty: 'standard', questionType: 'mixed', dueAt: '2026-11-16' };
  state.diagnosisPeriod ||= '30';
  state.focusQuestionId ||= state.task.questions.find(question => question.conflictStatus === 'teacher_marking_conflict')?.id;
  if (!Array.isArray(state.selectedQuestions)) state.selectedQuestions = [];
  if (!Array.isArray(state.practice.items)) state.practice.items = [];
  state.currentQuestion = Math.max(0, Math.min(state.currentQuestion || 0, state.practice.items.length - 1));
  if (state.task.status === 'generating') state.task.status = 'ready_for_practice';
}

function persistState() {
  const saved = saveState();
  if (!saved) showToast('本地保存空间不足，当前页面仍可继续操作。请移除较大的图片后重试。', 'warn');
  return saved;
}

function practiceEligible(question) {
  return ['none', 'student_error'].includes(question.conflictStatus)
    && question.teacherMarkingResult === 'incorrect'
    && ['parent_confirmed', 'teacher_confirmed', 'teacher_corrected'].includes(question.reviewStatus);
}

function worksheetPreview() {
  const rotation = Number(state.task.imageRotation || 0);
  const content = state.task.sourceImageDataUrl
    ? `<img class="worksheet-photo" src="${state.task.sourceImageDataUrl}" alt="${escapeHTML(state.task.sourceFileName)}" style="transform:rotate(${rotation}deg)" />`
    : `<div class="worksheet-lines" style="transform:rotate(${rotation - 2}deg)"></div>`;
  return `<div class="task-image">${content}<div class="image-tools"><button class="image-tool" data-action="zoom" aria-label="放大图片">${icon('expand')}</button><button class="image-tool" data-action="rotate" aria-label="旋转图片">${icon('rotate')}</button></div></div>`;
}

function questionCard(question) {
  const conflict = question.conflictStatus === 'teacher_marking_conflict' || question.conflictStatus === 'needs_review';
  const confirmed = ['parent_confirmed', 'teacher_confirmed', 'teacher_corrected'].includes(question.reviewStatus);
  const verdict = { correct: '判断为正确', incorrect: '判断为错误', insufficient_information: '条件不足，无法判断' }[question.aiMathVerdict];
  const marking = { correct: '正确', incorrect: '错误', unclear: '不明确' }[question.teacherMarkingResult];
  return `<article class="question-card" data-question="${escapeHTML(question.id)}">
    <div class="question-head"><span class="question-no">第 ${escapeHTML(question.questionNo)} 题</span><div class="question-flags">
      ${conflict ? '<span class="pill pill-orange">教师批改与数学复核结果不一致</span>' : ''}
      ${question.recognitionConfidence === 'low' ? '<span class="pill pill-red">低置信度</span>' : ''}
      ${confirmed ? `<span class="pill pill-green">${['teacher_confirmed', 'teacher_corrected'].includes(question.reviewStatus) ? '老师已复核' : '家长已确认'}</span>` : ''}
    </div></div>
    <p class="question-text">${escapeHTML(question.questionText)}</p>
    <div class="answer-box"><div><label>学生作答</label><span>${escapeHTML(question.studentWork)}</span></div>
      <div><label>教师原始批改</label><span>${marking}${question.teacherWrittenAnswer ? ` · ${escapeHTML(question.teacherWrittenAnswer)}` : ''}</span></div>
      <div><label>AI 数学复核</label><span>${verdict}</span></div>
      <div><label>识别出的正确答案</label><span>${escapeHTML(question.verifiedCorrectAnswer || '待补充')}</span></div></div>
    <div class="question-meta"><span class="pill pill-blue">${escapeHTML(question.knowledgePoint || '待归类')}</span><span class="confidence">识别置信度：${{ high: '高', medium: '中', low: '低' }[question.recognitionConfidence]}</span></div>
    ${conflict ? `<div class="notice notice-warn question-warning">${icon('alert')}<div><strong>这道题暂不能进入练习</strong>家长可以提交老师复核，数学结论由老师最终确认。</div></div>` : ''}
    <div class="question-actions">
      ${conflict ? `<button class="btn btn-warn btn-sm" data-action="send-review" data-id="${escapeHTML(question.id)}">${question.reviewStatus === 'parent_confirmed' ? '交给老师复核' : '提交老师复核'}</button>` : confirmed ? '<span class="muted question-confirmed">已确认，可在练习设置中选择</span>' : `<button class="btn btn-secondary btn-sm" data-action="confirm-question" data-id="${escapeHTML(question.id)}">${icon('check')}确认无误</button>`}
      <button class="btn btn-secondary btn-sm" data-action="edit-question" data-id="${escapeHTML(question.id)}">${icon('edit')}修改识别内容</button>
      ${!conflict && !confirmed ? `<button class="btn btn-ghost btn-sm" data-action="not-mistake" data-id="${escapeHTML(question.id)}">标记不是错题</button>` : ''}
    </div>
  </article>`;
}

function parentHome() {
  const pending = state.task.questions.filter(question => question.reviewStatus === 'pending' && question.teacherMarkingResult !== 'correct').length;
  const wrongCount = state.task.questions.filter(question => question.teacherMarkingResult !== 'correct').length;
  return `<div class="page-head"><div><div class="eyebrow">家长工作台 · 今日</div><h1 class="page-title">把错题变成下一次进步</h1><p class="page-subtitle">先确认识别结果，再为李明安排有针对性的练习。</p></div><div class="head-actions"><button class="btn btn-primary" data-nav="upload">${icon('upload')}上传一份新作业</button></div></div>
    <div class="stats-grid"><div class="stat-card"><div class="stat-top"><span>待确认题目</span><span class="stat-icon tint-orange">${icon('clock')}</span></div><div class="stat-value">${pending}</div><div class="stat-foot">冲突题由老师复核</div></div>
    <div class="stat-card"><div class="stat-top"><span>本周已生成练习</span><span class="stat-icon tint-blue">${icon('book')}</span></div><div class="stat-value">${state.practice.status === 'draft' ? 2 : 3}</div><div class="stat-foot">练习完成后会更新进展</div></div>
    <div class="stat-card"><div class="stat-top"><span>识别出的错题</span><span class="stat-icon tint-green">${icon('alert')}</span></div><div class="stat-value">${wrongCount}</div><div class="stat-foot">${state.task.questions.length} 道题已识别</div></div>
    <div class="stat-card"><div class="stat-top"><span>近期薄弱知识点</span><span class="stat-icon tint-purple">${icon('trend')}</span></div><div class="stat-value stat-topic">绝对值方程</div><div class="stat-foot">建议先练习漏解问题</div></div></div>
    <div class="grid-2"><div class="card"><div class="card-head"><div><h2>最近任务</h2><p>作业识别与练习状态</p></div><button class="btn btn-ghost btn-sm" data-nav="confirm">查看错题 ${icon('chevron')}</button></div><div class="card-body"><div class="list">
      <div class="list-row"><div class="row-thumb">${icon('image')}</div><div class="row-main"><strong>${escapeHTML(state.task.sourceFileName)}</strong><span>李明 · ${escapeHTML(state.task.uploadedAt)} · 识别 ${state.task.questions.length} 题，错题 ${wrongCount} 题</span></div><div class="row-right">${statusPill(state.task.status)}<button class="btn btn-secondary btn-sm" data-nav="confirm">去处理</button></div></div>
      <div class="list-row"><div class="row-thumb">${icon('book')}</div><div class="row-main"><strong>${escapeHTML(state.practice.title)}</strong><span>${state.practice.totalQuestions} 道题 · 截止 ${escapeHTML(state.practice.dueAt || '待设置')}</span></div><div class="row-right">${statusPill(state.practice.status)}<button class="btn btn-secondary btn-sm" data-nav="practice">设置</button></div></div>
      <div class="list-row"><div class="row-thumb">${icon('clipboard')}</div><div class="row-main"><strong>上周几何练习</strong><span>已完成 · 正确率 83%</span></div><div class="row-right">${statusPill('completed')}<button class="btn btn-secondary btn-sm" data-nav="progress">查看</button></div></div>
    </div></div></div><div class="card"><div class="card-head"><div><h2>孩子近期薄弱知识点</h2><p>按近 30 天练习表现排序</p></div></div><div class="card-body"><div class="knowledge-list"><div class="knowledge-item"><span class="label">绝对值方程</span><div class="progress-track"><div class="progress-fill" style="width:82%;background:#c66a12"></div></div><span class="value">82%</span></div><div class="knowledge-item"><span class="label">平行线与角</span><div class="progress-track"><div class="progress-fill" style="width:58%"></div></div><span class="value">58%</span></div><div class="knowledge-item"><span class="label">一元一次方程</span><div class="progress-track"><div class="progress-fill" style="width:34%;background:#18794e"></div></div><span class="value">34%</span></div></div></div></div></div>`;
}

function parentUpload() {
  const inProgress = state.task.status === 'recognizing';
  const uploaded = Boolean(state.task.sourceImageDataUrl);
  return `<div class="page-head"><div><div class="eyebrow">家长工作台 · 新任务</div><h1 class="page-title">上传一份新作业</h1><p class="page-subtitle">支持 JPG、PNG，单张图片不超过 10MB。</p></div></div>
    <div class="stepper"><div class="stepper-item ${uploaded ? 'done' : 'active'}"><span class="stepper-num">${uploaded ? icon('check') : '1'}</span>上传图片</div><div class="stepper-item ${inProgress ? 'active' : ''}"><span class="stepper-num">2</span>AI识别</div><div class="stepper-item"><span class="stepper-num">3</span>家长确认</div><div class="stepper-item"><span class="stepper-num">4</span>选择练习</div><div class="stepper-item"><span class="stepper-num">5</span>生成完成</div></div>
    <div class="grid-2"><div class="card"><div class="card-head"><div><h2>作业图片</h2><p>拍清楚题目和教师批改痕迹</p></div>${uploaded ? '<span class="pill pill-green">已上传</span>' : ''}</div><div class="card-body">
      <div class="upload-drop" data-dropzone><input class="hide" type="file" id="file-input" accept="image/jpeg,image/png" /><div>${uploaded ? `<div class="upload-preview">${worksheetPreview()}</div><strong>${escapeHTML(state.task.sourceFileName)}</strong><p>图片已保存在本演示数据中，刷新后仍可查看。</p>` : `<div class="upload-icon">${icon('upload')}</div><strong>拖拽图片到这里，或点击选择文件</strong><p>JPG、PNG · 最大 10MB · 支持单张上传</p>`}
      ${inProgress ? `<div class="upload-progress"><div class="progress-track"><div class="progress-fill" style="width:${Number(state.task.uploadProgress)}%"></div></div><span>正在识别作业内容…</span></div>` : ''}
      ${state.task.uploadError ? `<div class="notice notice-error upload-error">${icon('alert')}<div><strong>图片没有上传成功</strong>${escapeHTML(state.task.uploadError)}<button class="btn btn-ghost btn-sm" data-action="choose-file">重新选择图片</button></div></div>` : ''}
      <div class="upload-actions"><button class="btn btn-primary" data-action="choose-file" ${inProgress ? 'disabled' : ''}>${uploaded ? '更换图片' : '选择图片'}</button>${uploaded && !inProgress ? `<button class="btn btn-secondary" data-nav="confirm">查看识别结果 ${icon('arrow')}</button>` : ''}</div></div></div>
      <div class="notice notice-info mt-18">${icon('help')}<div><strong>家长只需要确认识别内容</strong>数学结论由老师复核，遇到冲突时可以提交复核。</div></div></div></div>
      <div class="card"><div class="card-head"><div><h2>上传前检查</h2><p>让题目和批改结果更容易识别</p></div></div><div class="card-body"><div class="detail-list"><div class="detail-item"><h3>${icon('check')} 光线均匀</h3><p>避免反光和阴影，题目边缘完整可见。</p></div><div class="detail-item"><h3>${icon('check')} 一页一张</h3><p>如果作业有多页，可以逐页上传并确认。</p></div><div class="detail-item"><h3>${icon('check')} 保留批改痕迹</h3><p>老师的对错标记会帮助区分正确题和错题。</p></div></div></div></div></div>`;
}

function parentConfirm() {
  const visible = state.task.questions.filter(question => question.teacherMarkingResult !== 'correct' || question.conflictStatus !== 'none');
  return `<div class="page-head"><div><div class="eyebrow">家长工作台 · 识别确认</div><h1 class="page-title">确认错题识别结果</h1><p class="page-subtitle">确认识别内容是否准确；数学判断有冲突时交给老师。</p></div><div class="head-actions"><button class="btn btn-secondary" data-nav="taskDetail">查看任务详情</button><button class="btn btn-primary" data-nav="practice">下一步：选择练习 ${icon('arrow')}</button></div></div>
    ${state.task.saveStatus === 'failed' ? `<div class="notice notice-warn sync-warning">${icon('alert')}<div><strong>错题暂未同步到历史记录，但仍可基于本次识别结果生成练习。</strong><span>你可以先完成本次练习，稍后重新同步。</span><button class="btn btn-ghost btn-sm" data-action="resync">重新同步</button></div></div>` : ''}
    <div class="card timeline-card">${taskTimeline(state.task.status)}</div><div class="split confirm-layout"><div class="card"><div class="card-head"><div><h2>原始作业图片</h2><p>${escapeHTML(state.task.sourceFileName)}</p></div></div><div class="card-body">${worksheetPreview()}<p class="muted image-caption">图片工具仅调整预览，不会修改原始文件。</p></div></div>
    <div class="confirm-list"><div class="notice notice-info">${icon('help')}<div><strong>共 ${visible.length} 道题需要确认</strong>正确题已自动归档。</div></div>
      ${visible.length ? visible.map(questionCard).join('') : `<div class="empty-state"><div class="empty-icon">${icon('check')}</div><strong>当前没有待确认错题</strong><p>所有识别结果都已处理，可以查看任务或继续管理练习。</p><button class="btn btn-secondary btn-sm" data-nav="practice">查看练习设置</button></div>`}
    </div></div>`;
}

function parentPractice() {
  const settings = state.practiceSettings;
  const eligible = state.task.questions.filter(practiceEligible);
  const selected = eligible.filter(question => state.selectedQuestions.includes(question.id));
  const estimated = selected.length * Number(settings.questionsPerMistake);
  const points = [...new Set(selected.map(question => question.knowledgePoint).filter(Boolean))];
  const typeLabels = { mixed: '混合题型', choice: '选择题', blank: '填空题', solution: '解答题' };
  return `<div class="page-head"><div><div class="eyebrow">家长工作台 · 练习设置</div><h1 class="page-title">生成针对性练习</h1><p class="page-subtitle">只会使用已确认且没有待复核冲突的错题。</p></div><div class="head-actions"><button class="btn btn-secondary" data-nav="confirm">返回确认</button><button class="btn btn-primary" data-action="generate" ${estimated === 0 || state.generating ? 'disabled' : ''}>${state.generating ? '正在生成…' : '生成针对性练习'} ${icon('arrow')}</button></div></div>
    <div class="stepper"><div class="stepper-item done"><span class="stepper-num">${icon('check')}</span>上传图片</div><div class="stepper-item done"><span class="stepper-num">${icon('check')}</span>AI识别</div><div class="stepper-item done"><span class="stepper-num">${icon('check')}</span>家长确认</div><div class="stepper-item active"><span class="stepper-num">4</span>选择练习</div><div class="stepper-item"><span class="stepper-num">5</span>生成完成</div></div>
    ${state.task.saveStatus === 'failed' ? `<div class="notice notice-warn sync-warning">${icon('alert')}<div><strong>错题暂未同步到历史记录，但仍可基于本次识别结果生成练习。</strong><span>保存失败不会影响本次生成。</span><button class="btn btn-ghost btn-sm" data-action="resync">重新同步</button></div></div>` : ''}
    <div class="grid-2 practice-settings-layout"><div class="card"><div class="card-head"><div><h2>选择需要强化的错题</h2><p>冲突题完成老师复核后才会开放</p></div><span class="pill pill-blue">已选 ${selected.length} 道</span></div><div class="card-body">${eligible.length ? eligible.map(question => `<label class="choice selectable-question"><input type="checkbox" data-question-check="${escapeHTML(question.id)}" ${state.selectedQuestions.includes(question.id) ? 'checked' : ''}/><span><strong>第 ${escapeHTML(question.questionNo)} 题 · ${escapeHTML(question.knowledgePoint)}</strong><small>${escapeHTML(question.errorType || '待强化')} · ${escapeHTML(question.questionText)}</small></span></label>`).join('') : `<div class="empty-state"><div class="empty-icon">${icon('lock')}</div><strong>还没有可用于练习的错题</strong><p>请先在“待确认”中确认错题；批改冲突需要老师完成复核。</p><button class="btn btn-secondary btn-sm" data-nav="confirm">去确认错题</button></div>`}</div></div>
    <div class="card"><div class="card-head"><div><h2>练习参数</h2><p>调整后右侧预览会同步更新</p></div></div><div class="card-body"><div class="field"><label for="per-question">每道错题生成</label><select id="per-question" data-setting="questionsPerMistake"><option value="1" ${settings.questionsPerMistake === 1 ? 'selected' : ''}>1 道</option><option value="2" ${settings.questionsPerMistake === 2 ? 'selected' : ''}>2 道</option><option value="3" ${settings.questionsPerMistake === 3 ? 'selected' : ''}>3 道</option><option value="5" ${settings.questionsPerMistake === 5 ? 'selected' : ''}>5 道</option></select></div>
      <div class="field-row"><div class="field"><label for="difficulty">难度</label><select id="difficulty" data-setting="difficulty"><option value="basic" ${settings.difficulty === 'basic' ? 'selected' : ''}>基础</option><option value="standard" ${settings.difficulty === 'standard' ? 'selected' : ''}>标准</option><option value="advanced" ${settings.difficulty === 'advanced' ? 'selected' : ''}>提高</option></select></div><div class="field"><label for="question-type">题型</label><select id="question-type" data-setting="questionType"><option value="mixed" ${settings.questionType === 'mixed' ? 'selected' : ''}>混合题型</option><option value="choice" ${settings.questionType === 'choice' ? 'selected' : ''}>选择题</option><option value="blank" ${settings.questionType === 'blank' ? 'selected' : ''}>填空题</option><option value="solution" ${settings.questionType === 'solution' ? 'selected' : ''}>解答题</option></select></div></div>
      <label class="check-row"><input type="checkbox" data-setting="includeHistory" ${settings.includeHistory ? 'checked' : ''}/> 混入历史薄弱知识点</label>
      <div class="setting-summary live-summary"><h3>生成预览</h3><div class="summary-line"><span>已选错题</span><strong>${selected.length} 道</strong></div><div class="summary-line"><span>预计生成</span><strong>${estimated} 题</strong></div><div class="summary-line"><span>题型 · 难度</span><strong>${typeLabels[settings.questionType]} · ${{ basic: '基础', standard: '标准', advanced: '提高' }[settings.difficulty]}</strong></div><div class="summary-line"><span>知识点</span><strong>${escapeHTML(points.join('、') || '未选择')}</strong></div><div class="summary-line"><span>预计用时</span><strong>约 ${Math.max(0, estimated * 4)} 分钟</strong></div></div>
      ${state.generating ? `<div class="notice notice-info mt-18">${icon('clock')}<div><strong>正在生成练习</strong>完成后会在学生端显示。</div></div>` : ''}
    </div></div></div>`;
}

function taskTimeline(current = 'needs_confirmation') {
  const steps = [['uploaded', '已上传'], ['recognizing', 'AI识别中'], ['needs_confirmation', '等待确认'], ['needs_teacher_review', '数学冲突复核'], ['confirmed', '已确认'], ['generating', '练习生成中'], ['assigned', '已布置'], ['in_progress', '学生作答中'], ['submitted', '已提交'], ['completed', '已完成']];
  const statusIndex = Math.max(0, steps.findIndex(step => step[0] === current));
  return `<div class="timeline" aria-label="任务进度">${steps.map(([key, label], index) => {
    const conflictPending = key === 'needs_teacher_review' && state.task.questions.some(question => question.conflictStatus === 'teacher_marking_conflict');
    const completed = index < statusIndex;
    const active = index === statusIndex || (conflictPending && current !== 'needs_teacher_review' && current !== 'completed');
    const failed = key === 'save_failed' && state.task.saveStatus === 'failed';
    return `<button class="timeline-step ${completed ? 'done' : ''} ${active ? 'active' : ''} ${failed ? 'failed' : ''}" data-action="timeline" data-status="${key}" aria-current="${active ? 'step' : 'false'}"><span class="timeline-dot">${completed ? icon('check') : index + 1}</span><span>${label}</span></button>`;
  }).join('')}</div>${state.task.saveStatus === 'failed' ? `<div class="timeline-warning">${icon('alert')}历史记录同步失败；不影响继续确认和生成练习。</div>` : ''}`;
}

function studentToday() {
  const completed = state.practice.status === 'completed';
  return `<div class="page-head"><div><div class="eyebrow">学生工作台 · ${new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })}</div><h1 class="page-title">今天，完成一小步</h1><p class="page-subtitle">这里是只属于你的练习，按自己的节奏完成即可。</p></div></div>
    <div class="stats-grid"><div class="stat-card"><div class="stat-top"><span>${completed ? '已完成练习' : '待完成练习'}</span><span class="stat-icon tint-orange">${icon('clock')}</span></div><div class="stat-value">${completed ? 0 : 1}</div><div class="stat-foot">${completed ? '已提交并开放解析' : `截止 ${escapeHTML(state.practice.dueAt || '待设置')}`}</div></div><div class="stat-card"><div class="stat-top"><span>本周完成</span><span class="stat-icon tint-green">${icon('check')}</span></div><div class="stat-value">${completed ? 5 : 4}</div><div class="stat-foot">练习记录会持续更新</div></div><div class="stat-card"><div class="stat-top"><span>最近正确率</span><span class="stat-icon tint-blue">${icon('trend')}</span></div><div class="stat-value">${completed ? `${state.submission?.score ?? 83}%` : '83%'}</div><div class="stat-foot">来自近期练习</div></div><div class="stat-card"><div class="stat-top"><span>连续学习</span><span class="stat-icon tint-purple">${icon('book')}</span></div><div class="stat-value">6 天</div><div class="stat-foot">保持稳定节奏</div></div></div>
    <div class="grid-2"><div class="card"><div class="card-head"><div><h2>${completed ? '已完成练习' : '待完成练习'}</h2><p>${completed ? '你的作答结果与解析已开放' : '一次完成一题，专注解决问题'}</p></div><span class="pill ${completed ? 'pill-green' : 'pill-orange'}">${completed ? '已提交' : '今天'}</span></div><div class="card-body"><div class="list-row"><div class="row-thumb">${icon('book')}</div><div class="row-main"><strong>${escapeHTML(state.practice.title)}</strong><span>${state.practice.items.length} 道题 · 预计 ${Math.ceil(state.practice.items.length * 4)} 分钟 · 截止 ${escapeHTML(state.practice.dueAt || '待设置')}</span><div class="student-topic-list">${state.practice.knowledgePoints.map(point => `<span class="pill pill-blue">${escapeHTML(point)}</span>`).join('')}</div></div><div class="row-right">${completed ? '<button class="btn btn-secondary btn-sm" data-nav="results">查看结果</button>' : `<button class="btn btn-primary btn-sm" data-nav="practiceDetail">${state.draftAnswers && Object.keys(state.draftAnswers).length ? '继续练习' : '开始练习'} ${icon('arrow')}</button>`}</div></div></div></div><div class="card"><div class="card-head"><div><h2>学习提醒</h2><p>先关注当前练习中的知识点</p></div></div><div class="card-body"><div class="notice notice-info">${icon('help')}<div><strong>提交后可以查看答案和解析</strong>提交前页面不会显示正确答案。</div></div></div></div></div>
    <div class="card section-gap"><div class="card-head"><div><h2>已完成练习</h2><p>最近提交的练习记录</p></div></div><div class="card-body">${completed ? `<div class="list-row"><div class="row-thumb">${icon('check')}</div><div class="row-main"><strong>${escapeHTML(state.practice.title)}</strong><span>${state.practice.items.length} 道题 · 正确率 ${state.submission?.score ?? 0}%</span></div><div class="row-right"><button class="btn btn-secondary btn-sm" data-nav="results">查看解析</button></div></div>` : '<div class="empty-state compact-empty"><strong>还没有新的完成记录</strong><p>完成今天的练习后，结果会显示在这里。</p></div>'}</div></div>`;
}

function studentPractice() {
  if (state.submission) return studentResults();
  const item = state.practice.items[state.currentQuestion];
  if (!item) return `<div class="empty-state"><strong>当前没有可作答的练习</strong><p>新的练习布置后会显示在这里。</p><button class="btn btn-secondary" data-nav="today">返回今日练习</button></div>`;
  const answer = state.draftAnswers[item.id] || '';
  const answered = state.practice.items.filter(question => Boolean(state.draftAnswers[question.id])).length;
  const options = item.questionType === 'choice' && item.options ? `<div class="choice-list">${item.options.map((option, index) => `<label class="choice"><input type="radio" name="answer" value="${escapeHTML(option)}" ${answer === option ? 'checked' : ''}/><span>${String.fromCharCode(65 + index)}. ${escapeHTML(option)}</span></label>`).join('')}</div>` : item.questionType === 'solution' ? `<textarea id="answer-input" aria-label="解题过程" placeholder="写下你的解题过程…">${escapeHTML(answer)}</textarea>` : `<input id="answer-input" aria-label="填写答案" value="${escapeHTML(answer)}" placeholder="填写答案" />`;
  const handwriting = state.handwritingByItem[item.id];
  return `<div class="page-head"><div><div class="eyebrow">在线练习 · ${escapeHTML(state.practice.title)}</div><h1 class="page-title">第 ${state.currentQuestion + 1} 题</h1><p class="page-subtitle">完成后提交，系统会批改并开放逐题解析。</p></div><div class="head-actions"><button class="btn btn-secondary" data-nav="today">退出练习</button></div></div>
    <div class="practice-layout"><aside class="card number-nav"><h3>题目导航</h3><div class="number-grid">${state.practice.items.map((question, index) => `<button class="number-btn ${index === state.currentQuestion ? 'current' : ''} ${state.draftAnswers[question.id] ? 'answered' : ''}" data-question-index="${index}" aria-label="第 ${index + 1} 题${state.draftAnswers[question.id] ? '，已作答' : ''}">${index + 1}</button>`).join('')}</div><p class="muted nav-help">绿色题号表示已作答</p></aside>
    <main class="card practice-panel"><div class="practice-meta"><span>第 ${state.currentQuestion + 1} / ${state.practice.items.length} 题</span><span>${Math.round(answered / state.practice.items.length * 100)}% 已完成</span></div><div class="progress-track question-progress"><div class="progress-fill" style="width:${Math.round(answered / state.practice.items.length * 100)}%"></div></div><h2>${escapeHTML(item.questionText)}</h2>${options}
      <div class="handwriting-area"><input class="hide" type="file" id="handwriting-input" accept="image/jpeg,image/png" /><button class="btn btn-secondary btn-sm" data-action="upload-handwriting">${icon('image')}上传手写解题图片</button>${handwriting ? `<div class="handwriting-preview"><img src="${handwriting}" alt="已上传的手写解题过程"/><button class="btn btn-ghost btn-sm" data-action="remove-handwriting">移除图片</button></div>` : ''}</div>
      <div class="practice-mobile-progress">已作答 ${answered} / ${state.practice.items.length} 题</div><div class="practice-foot"><button class="btn btn-secondary" data-action="prev" ${state.currentQuestion === 0 ? 'disabled' : ''}>上一题</button><div class="practice-controls"><button class="btn btn-secondary" data-action="next" ${state.currentQuestion === state.practice.items.length - 1 ? 'disabled' : ''}>下一题</button><button class="btn btn-primary" data-action="submit-practice">提交练习</button></div></div>
    </main><aside class="card practice-side"><div class="card-body"><div class="progress-ring"><span>${Math.round(answered / state.practice.items.length * 100)}%</span></div><div class="side-stat"><strong>答题进度</strong>${answered} / ${state.practice.items.length} 题已作答</div><div class="detail-item practice-tip"><h3>${icon('help')} 解题提示</h3><p>先写出关键步骤，再检查符号与计算。</p></div></div></aside></div>`;
}

function studentResults() {
  if (!state.submission) return studentToday();
  const results = state.submission.results || [];
  const correct = results.filter(result => result.isCorrect).length;
  return `<div class="page-head"><div><div class="eyebrow">练习结果 · ${escapeHTML(state.practice.title)}</div><h1 class="page-title">提交结果</h1><p class="page-subtitle">逐题查看作答、正确答案和解题说明。</p></div><div class="head-actions"><button class="btn btn-secondary" data-action="more-actions">${icon('more')}更多操作</button></div></div>
    <div class="card result-hero"><div class="score"><div class="score-content"><strong>${state.submission.score ?? 0}</strong><span>本次得分</span></div></div><div><h2 class="result-title">本次完成 ${results.length} 道题</h2><p>错题可以查看解析后再练习，按自己的节奏复习。</p><div class="result-cards"><div class="result-mini"><span>正确</span><strong>${correct}</strong></div><div class="result-mini"><span>需要复习</span><strong>${results.length - correct}</strong></div><div class="result-mini"><span>涉及知识点</span><strong>${state.practice.knowledgePoints.length}</strong></div></div></div></div>
    <div class="card section-gap"><div class="card-head"><div><h2>逐题解析</h2><p>答案和解析仅在提交后开放</p></div></div><div class="card-body">${results.map(result => {
      const item = state.practice.items.find(question => question.id === result.practiceItemId);
      return `<article class="result-question"><div class="question-head"><span class="question-no">第 ${escapeHTML(item?.questionNo || '')} 题</span><span class="pill ${result.isCorrect ? 'pill-green' : 'pill-orange'}">${result.isCorrect ? '回答正确' : '需要复习'}</span></div><p class="question-text">${escapeHTML(item?.questionText || '')}</p><div class="result-answer-grid"><div><label>我的作答</label><strong>${escapeHTML(result.studentAnswer || '未作答')}</strong></div><div><label>正确答案</label><strong>${escapeHTML(result.correctAnswer)}</strong></div><div><label>知识点</label><strong>${escapeHTML(item?.knowledgePoint || '')}</strong></div></div><div class="explanation-block"><strong>解题说明</strong><p>${escapeHTML(result.explanation)}</p><span>易错提醒：注意按题目条件完整分类讨论，并检查最终答案。</span></div></article>`;
    }).join('')}</div></div><div class="page-end-actions"><button class="btn btn-secondary" data-nav="today">返回今日练习</button><button class="btn btn-primary" data-action="again">再练一组 ${icon('arrow')}</button></div>`;
}

function studentMistakes() {
  const questions = state.task.questions.filter(question => question.teacherMarkingResult === 'incorrect' && question.conflictStatus === 'none');
  return `<div class="page-head"><div><div class="eyebrow">学生工作台 · 错题复习</div><h1 class="page-title">我的错题</h1><p class="page-subtitle">复习已经确认的错题，找到下一步需要练习的知识点。</p></div></div><div class="card"><div class="card-body">${questions.length ? questions.map(question => `<article class="question-card"><div class="question-head"><span class="question-no">第 ${escapeHTML(question.questionNo)} 题 · ${escapeHTML(question.knowledgePoint)}</span><span class="pill pill-orange">待强化</span></div><p class="question-text">${escapeHTML(question.questionText)}</p><div class="answer-box"><div><label>我的作答</label><span>${escapeHTML(question.studentWork)}</span></div><div><label>易错类型</label><span>${escapeHTML(question.errorType || '计算过程待检查')}</span></div></div><button class="btn btn-primary btn-sm" data-nav="practiceDetail">开始同类练习</button></article>`).join('') : `<div class="empty-state"><div class="empty-icon">${icon('check')}</div><strong>暂时没有已确认的错题</strong><p>老师复核中的题目完成后会显示在这里。</p></div>`}</div></div>`;
}

function teacherReview() {
  const filters = state.reviewFilters;
  let queue = state.task.questions.map(question => ({ ...question, studentName: '李明', className: '初一（3）班' })).filter(question => ['teacher_marking_conflict', 'needs_review'].includes(question.conflictStatus) || (question.recognitionConfidence === 'low' && question.reviewStatus !== 'teacher_confirmed'));
  if (filters.student !== 'all' && filters.student !== '李明') queue = [];
  if (filters.knowledge !== 'all') queue = queue.filter(question => question.knowledgePoint === filters.knowledge);
  if (filters.conflict === 'conflict') queue = queue.filter(question => question.conflictStatus === 'teacher_marking_conflict');
  if (filters.conflict === 'insufficient') queue = queue.filter(question => question.aiMathVerdict === 'insufficient_information');
  if (filters.confidence !== 'all') queue = queue.filter(question => question.recognitionConfidence === filters.confidence);
  return `<div class="page-head"><div><div class="eyebrow">老师工作台 · 需要你的判断</div><h1 class="page-title">待复核</h1><p class="page-subtitle">优先处理批改冲突、低置信度和题目条件不足。</p></div><div class="head-actions"><button class="btn btn-secondary" data-action="refresh">${icon('clock')}刷新列表</button></div></div>
    <div class="stats-grid"><div class="stat-card"><div class="stat-top"><span>待复核题目</span><span class="stat-icon tint-orange">${icon('alert')}</span></div><div class="stat-value">${queue.length}</div><div class="stat-foot">按当前筛选条件</div></div><div class="stat-card"><div class="stat-top"><span>批改冲突</span><span class="stat-icon tint-orange">${icon('help')}</span></div><div class="stat-value">${state.task.questions.filter(question => question.conflictStatus === 'teacher_marking_conflict').length}</div><div class="stat-foot">需要教师最终判断</div></div><div class="stat-card"><div class="stat-top"><span>低置信度</span><span class="stat-icon tint-purple">${icon('image')}</span></div><div class="stat-value">${state.task.questions.filter(question => question.recognitionConfidence === 'low' && question.conflictStatus !== 'none').length}</div><div class="stat-foot">识别结果需确认</div></div><div class="stat-card"><div class="stat-top"><span>今日已完成</span><span class="stat-icon tint-green">${icon('check')}</span></div><div class="stat-value">12</div><div class="stat-foot">包括其他班级任务</div></div></div>
    <div class="card"><div class="filter-bar review-filters"><select data-review-filter="student"><option value="all" ${filters.student === 'all' ? 'selected' : ''}>全部学生</option><option value="李明" ${filters.student === '李明' ? 'selected' : ''}>李明</option></select><select data-review-filter="knowledge"><option value="all" ${filters.knowledge === 'all' ? 'selected' : ''}>全部知识点</option>${[...new Set(state.task.questions.map(question => question.knowledgePoint).filter(Boolean))].map(point => `<option value="${escapeHTML(point)}" ${filters.knowledge === point ? 'selected' : ''}>${escapeHTML(point)}</option>`).join('')}</select><select data-review-filter="conflict"><option value="all" ${filters.conflict === 'all' ? 'selected' : ''}>全部问题类型</option><option value="conflict" ${filters.conflict === 'conflict' ? 'selected' : ''}>批改冲突</option><option value="insufficient" ${filters.conflict === 'insufficient' ? 'selected' : ''}>条件不足</option></select><select data-review-filter="confidence"><option value="all" ${filters.confidence === 'all' ? 'selected' : ''}>全部置信度</option><option value="low" ${filters.confidence === 'low' ? 'selected' : ''}>低</option><option value="medium" ${filters.confidence === 'medium' ? 'selected' : ''}>中</option><option value="high" ${filters.confidence === 'high' ? 'selected' : ''}>高</option></select><button class="btn btn-secondary btn-sm" data-action="reset-review-filters">重置筛选</button></div>
    <div class="table-wrap"><table><thead><tr><th>优先级</th><th>学生 / 班级</th><th>题目</th><th>问题类型</th><th>识别置信度</th><th>提交时间</th><th></th></tr></thead><tbody>${queue.length ? queue.map(question => `<tr><td><span class="pill ${question.conflictStatus === 'teacher_marking_conflict' ? 'pill-red' : 'pill-orange'}">${question.conflictStatus === 'teacher_marking_conflict' ? '高' : '中'}</span></td><td><strong>${question.studentName}</strong><br/><span class="muted">${question.className}</span></td><td>第 ${escapeHTML(question.questionNo)} 题 · ${escapeHTML(question.knowledgePoint)}</td><td><span class="pill pill-orange">${question.conflictStatus === 'teacher_marking_conflict' ? '教师批改冲突' : '低置信度 / 条件不足'}</span></td><td>${{ high: '高', medium: '中', low: '低' }[question.recognitionConfidence]}</td><td>${escapeHTML(state.task.uploadedAt)}</td><td><button class="btn btn-primary btn-sm" data-action="review-question" data-id="${escapeHTML(question.id)}">开始复核</button></td></tr>`).join('') : `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">${icon('check')}</div><strong>没有符合条件的待复核题目</strong><p>可以调整筛选条件，或稍后刷新任务列表。</p><button class="btn btn-secondary btn-sm" data-action="reset-review-filters">重置筛选</button></div></td></tr>`}</tbody></table></div></div>`;
}

function teacherReviewDetail() {
  const question = state.task.questions.find(item => item.id === state.focusQuestionId)
    || state.task.questions.find(item => item.conflictStatus !== 'none') || state.task.questions[0];
  if (!question) return teacherReview();
  const verdict = { correct: '判断为正确', incorrect: '判断为错误', insufficient_information: '条件不足，无法判断唯一答案' }[question.aiMathVerdict];
  return `<div class="page-head"><div><div class="eyebrow">老师工作台 · 复核详情</div><h1 class="page-title">复核第 ${escapeHTML(question.questionNo)} 题</h1><p class="page-subtitle">${escapeHTML(state.task.sourceFileName)} · 李明 · 初一（3）班</p></div><div class="head-actions"><button class="btn btn-secondary" data-nav="review">返回待复核</button></div></div>
    <div class="notice notice-warn review-banner">${icon('alert')}<div><strong>${question.conflictStatus === 'teacher_marking_conflict' ? '教师批改与数学复核结果不一致' : '识别结果需要教师确认'}</strong>请结合原始图片和完整题目条件进行最终判断。</div></div><div class="card timeline-card">${taskTimeline('needs_teacher_review')}</div>
    <div class="review-detail-grid"><section class="card"><div class="card-head"><div><h2>原始作业图片</h2><p>可放大、旋转查看</p></div></div><div class="card-body">${worksheetPreview()}</div></section>
    <section class="card"><div class="card-head"><div><h2>识别结果</h2><p>AI 结果仅供参考</p></div><span class="pill ${question.recognitionConfidence === 'low' ? 'pill-red' : 'pill-orange'}">${{ high: '高', medium: '中', low: '低' }[question.recognitionConfidence]}置信度</span></div><div class="card-body"><div class="review-question-summary"><span class="question-no">第 ${escapeHTML(question.questionNo)} 题 · ${escapeHTML(question.knowledgePoint)}</span><p class="question-text">${escapeHTML(question.questionText)}</p><div class="answer-box"><div><label>学生作答</label><span>${escapeHTML(question.studentWork)}</span></div><div><label>教师原始批改</label><span>${question.teacherMarkingResult === 'incorrect' ? '错误' : question.teacherMarkingResult === 'correct' ? '正确' : '不明确'} · ${escapeHTML(question.teacherWrittenAnswer || '未记录')}</span></div><div><label>AI 数学复核</label><span>${verdict}</span></div><div><label>识别正确答案</label><span>${escapeHTML(question.verifiedCorrectAnswer || '待补充')}</span></div></div><div class="review-reason"><strong>题目信息</strong><p>${escapeHTML(question.knowledgeExplanation || '请核对题目条件、作答过程和原始批改。')}</p></div></div></div></section>
    <section class="card"><div class="card-head"><div><h2>最终复核</h2><p>保存后更新家长和学生端</p></div></div><div class="card-body"><div class="field"><label for="review-knowledge">知识点</label><select id="review-knowledge"><option value="${escapeHTML(question.knowledgePoint)}">${escapeHTML(question.knowledgePoint)}</option>${['绝对值方程', '一元一次方程', '整式加减', '平行线与角', '余角与补角'].filter(point => point !== question.knowledgePoint).map(point => `<option value="${point}">${point}</option>`).join('')}</select></div><div class="field"><label for="review-answer">最终正确答案</label><input id="review-answer" value="${escapeHTML(question.verifiedCorrectAnswer || '')}" /></div><div class="field"><label for="review-note">复核备注</label><textarea id="review-note">${escapeHTML(question.knowledgeExplanation || '')}</textarea></div><div class="teacher-review-actions"><button class="btn btn-primary" data-action="teacher-confirm" data-id="${escapeHTML(question.id)}">${icon('check')}确认 AI 判断</button><button class="btn btn-secondary" data-action="teacher-correct" data-id="${escapeHTML(question.id)}">${icon('edit')}修改并保存</button><button class="btn btn-danger" data-action="teacher-reject" data-id="${escapeHTML(question.id)}">驳回重新识别</button></div></div></section></div>`;
}

function teacherStudents() {
  return `<div class="page-head"><div><div class="eyebrow">老师工作台 · 初一（3）班</div><h1 class="page-title">学生管理</h1><p class="page-subtitle">查看个人练习进度和知识点分布。</p></div><div class="head-actions"><button class="btn btn-secondary" data-action="export">${icon('download')}导出名单</button></div></div><div class="card"><div class="filter-bar"><input data-student-search type="search" aria-label="搜索学生姓名" placeholder="搜索学生姓名"/><select data-student-status><option value="all">全部状态</option><option value="focus">需要关注</option><option value="progress">进步明显</option></select></div><div class="table-wrap"><table><thead><tr><th>学生</th><th>近 7 天练习</th><th>正确率</th><th>薄弱知识点</th><th>最近活动</th><th></th></tr></thead><tbody>${demoStudents.map(student => `<tr data-student-row data-student-name="${student.name}" data-student-status="${student.accuracy < 80 ? 'focus' : 'progress'}"><td><strong>${student.name}</strong></td><td>${student.practiceCount} 份</td><td><span class="pill ${student.accuracy < 80 ? 'pill-orange' : 'pill-green'}">${student.accuracy}%</span></td><td>${student.weakPoint}</td><td>${student.activity}</td><td><button class="btn btn-secondary btn-sm" data-action="student-detail" data-id="${student.id}">查看</button></td></tr>`).join('')}</tbody></table></div><div class="card-body"><div class="empty-state hide" data-student-empty><strong>没有找到匹配的学生</strong><p>请检查姓名或状态筛选。</p></div></div></div>`;
}

function teacherStudentDetail(studentId) {
  const student = demoStudents.find(item => item.id === studentId) || demoStudents[0];
  const questions = state.task.questions.filter(question => question.teacherMarkingResult === 'incorrect' || question.conflictStatus !== 'none');
  return `<div class="page-head"><div><div class="eyebrow">学生管理 · ${escapeHTML(student.className || '初一（3）班')}</div><h1 class="page-title">${escapeHTML(student.name)}的学习进展</h1><p class="page-subtitle">近 7 天完成 ${student.practiceCount} 份练习，正确率 ${student.accuracy}%。</p></div><div class="head-actions"><button class="btn btn-secondary" data-nav="students">返回学生列表</button><button class="btn btn-primary" data-nav="assign">布置练习 ${icon('arrow')}</button></div></div><div class="stats-grid"><div class="stat-card"><div class="stat-top"><span>近 7 天练习</span></div><div class="stat-value">${student.practiceCount}</div></div><div class="stat-card"><div class="stat-top"><span>正确率</span></div><div class="stat-value">${student.accuracy}%</div></div><div class="stat-card"><div class="stat-top"><span>需关注知识点</span></div><div class="stat-value stat-topic">${escapeHTML(student.weakPoint)}</div></div></div><div class="card"><div class="card-head"><div><h2>近期错题</h2><p>已确认错题与待复核题目</p></div></div><div class="card-body">${questions.length ? questions.map(question => `<article class="question-card"><div class="question-head"><span class="question-no">第 ${escapeHTML(question.questionNo)} 题 · ${escapeHTML(question.knowledgePoint)}</span>${question.conflictStatus !== 'none' ? '<span class="pill pill-orange">待复核</span>' : '<span class="pill pill-red">已确认错题</span>'}</div><p class="question-text">${escapeHTML(question.questionText)}</p>${question.conflictStatus !== 'none' ? `<button class="btn btn-secondary btn-sm" data-action="review-question" data-id="${escapeHTML(question.id)}">进入复核</button>` : ''}</article>`).join('') : '<div class="empty-state"><strong>暂无近期错题</strong></div>'}</div></div>`;
}

function teacherAssignment() {
  const assignment = state.assignment;
  return `<div class="page-head"><div><div class="eyebrow">老师工作台 · 发布任务</div><h1 class="page-title">练习布置</h1><p class="page-subtitle">按班级或学生布置一份清晰、可完成的练习。</p></div><div class="head-actions"><button class="btn btn-primary" data-action="publish">${icon('send')}发布练习</button></div></div><div class="grid-2"><div class="card"><div class="card-head"><div><h2>练习设置</h2><p>发布前可预览题目范围</p></div></div><div class="card-body"><div class="field"><label for="assign-audience">布置给</label><select id="assign-audience" data-assignment="audience"><option value="class" ${assignment.audience === 'class' ? 'selected' : ''}>初一（3）班 · 45 人</option>${demoStudents.map(student => `<option value="${student.id}" ${assignment.audience === student.id ? 'selected' : ''}>指定学生：${student.name}</option>`).join('')}</select></div><div class="field"><label>知识点</label><div class="selected-points">${assignment.knowledgePoints.map(point => `<span class="pill pill-blue">${escapeHTML(point)} <button data-action="remove-assignment-point" data-id="${escapeHTML(point)}" aria-label="移除${escapeHTML(point)}">×</button></span>`).join('')}<button class="btn btn-secondary btn-sm" data-action="choose-knowledge">添加知识点</button></div></div><div class="field-row"><div class="field"><label for="assign-count">题量</label><select id="assign-count" data-assignment="count"><option value="6" ${assignment.count === '6' ? 'selected' : ''}>6 道</option><option value="10" ${assignment.count === '10' ? 'selected' : ''}>10 道</option><option value="15" ${assignment.count === '15' ? 'selected' : ''}>15 道</option></select></div><div class="field"><label for="assign-difficulty">难度</label><select id="assign-difficulty" data-assignment="difficulty"><option value="basic" ${assignment.difficulty === 'basic' ? 'selected' : ''}>基础</option><option value="standard" ${assignment.difficulty === 'standard' ? 'selected' : ''}>标准</option><option value="advanced" ${assignment.difficulty === 'advanced' ? 'selected' : ''}>提高</option></select></div></div><div class="field-row"><div class="field"><label for="assign-type">题型</label><select id="assign-type" data-assignment="questionType"><option value="mixed" ${assignment.questionType === 'mixed' ? 'selected' : ''}>混合题型</option><option value="choice" ${assignment.questionType === 'choice' ? 'selected' : ''}>选择题</option><option value="blank" ${assignment.questionType === 'blank' ? 'selected' : ''}>填空题</option><option value="solution" ${assignment.questionType === 'solution' ? 'selected' : ''}>解答题</option></select></div><div class="field"><label for="due-date">截止时间</label><input id="due-date" type="date" data-assignment="dueAt" value="${escapeHTML(assignment.dueAt)}" /></div></div></div></div><div class="card"><div class="card-head"><div><h2>发布前预览</h2><p>学生端只会看到题目和截止时间</p></div><span class="pill pill-green">${escapeHTML(assignment.count)} 道</span></div><div class="card-body"><div class="detail-list">${assignment.knowledgePoints.map(point => `<div class="detail-item"><h3>${escapeHTML(point)}</h3><p>从该知识点的错题与练习题库生成。</p></div>`).join('')}<div class="notice notice-info">${icon('clock')}<div><strong>预计完成时间：${Math.ceil(Number(assignment.count) * 4)} 分钟</strong>截止 ${escapeHTML(assignment.dueAt)} · 难度 ${{ basic: '基础', standard: '标准', advanced: '提高' }[assignment.difficulty]}</div></div></div></div></div></div>`;
}

function teacherQuestionsView() {
  const filter = state.diagnosisFilter || '';
  let questions = state.task.questions.filter(question => question.teacherMarkingResult !== 'correct' || question.conflictStatus !== 'none');
  if (filter && filter !== '李明') questions = questions.filter(question => question.knowledgePoint === filter);
  return `<div class="page-head"><div><div class="eyebrow">班级诊断 · 下钻结果</div><h1 class="page-title">${escapeHTML(filter || '班级')}相关题目</h1><p class="page-subtitle">从诊断指标进入题目，可继续查看原始作业和复核状态。</p></div><div class="head-actions"><button class="btn btn-secondary" data-nav="diagnosis">返回班级诊断</button></div></div><div class="card"><div class="card-body">${questions.length ? questions.map(question => `<article class="question-card"><div class="question-head"><span class="question-no">李明 · 第 ${escapeHTML(question.questionNo)} 题 · ${escapeHTML(question.knowledgePoint)}</span>${question.conflictStatus !== 'none' ? '<span class="pill pill-orange">待复核</span>' : '<span class="pill pill-red">错题</span>'}</div><p class="question-text">${escapeHTML(question.questionText)}</p><button class="btn btn-secondary btn-sm" data-action="review-question" data-id="${escapeHTML(question.id)}">查看题目</button></article>`).join('') : '<div class="empty-state"><strong>该筛选下暂无题目</strong><p>可以返回诊断页选择其他知识点。</p></div>'}</div></div>`;
}

function teacherView() {
  if (state.page === 'review') return teacherReview();
  if (state.page === 'taskDetail') return teacherReviewDetail();
  if (state.page === 'diagnosis') return teacherDiagnosis();
  if (state.page === 'diagnosisQuestions') return teacherQuestionsView();
  if (state.page === 'assign') return teacherAssignment();
  if (state.page === 'students') return teacherStudents();
  if (state.page === 'studentDetail') return teacherStudentDetail(state.focusStudentId);
  return teacherReview();
}

function pageTitle() {
  const labels = { home: '总览', upload: '上传作业', confirm: '待确认', practice: '练习管理', progress: '学习进展', today: '今日练习', mistakes: '我的错题', review: '待复核', students: '学生管理', diagnosis: '班级诊断', diagnosisQuestions: '诊断题目', studentDetail: '学生进展', assign: '练习布置', practiceDetail: '在线练习', results: '提交结果', taskDetail: '错题任务详情' };
  return labels[state.page] || '总览';
}

function shell() {
  const meta = roleMeta[state.role];
  const pending = state.task.questions.filter(question => ['teacher_marking_conflict', 'needs_review'].includes(question.conflictStatus)).length;
  return `<div class="app-shell"><aside class="sidebar"><div class="brand"><div class="brand-mark">错</div><div><h1>错题任务中心</h1><p>让每一道错题都有下一步</p></div></div><div class="nav-label">工作台</div><nav class="nav-list">${meta.nav.map(([id, label, glyph]) => `<button class="nav-item ${state.page === id ? 'active' : ''}" data-nav="${id}">${icon(glyph)}<span>${label}</span>${id === 'review' && pending ? `<span class="pill pill-orange nav-count">${pending}</span>` : ''}</button>`).join('')}</nav><div class="side-bottom"><p class="demo-note">演示角色切换仅用于产品演示；生产环境应由真实账号和服务端权限控制。</p><div class="user-card"><div class="avatar">${meta.initials}</div><div class="user-meta"><strong>${escapeHTML(meta.name)}</strong><span>${meta.role} · 初一（3）班</span></div></div></div></aside><main class="main"><header class="topbar"><div class="breadcrumb">工作台 / <strong>${escapeHTML(pageTitle())}</strong></div><div class="top-actions"><label class="role-control"><span>演示角色</span><select id="role-switch" aria-label="切换演示角色"><option value="student" ${state.role === 'student' ? 'selected' : ''}>学生</option><option value="parent" ${state.role === 'parent' ? 'selected' : ''}>家长</option><option value="teacher" ${state.role === 'teacher' ? 'selected' : ''}>老师</option></select></label><button class="icon-button" data-action="notifications" aria-label="通知中心">${icon('bell')}<span class="notification-dot"></span></button><button class="icon-button" data-action="help" aria-label="帮助">${icon('help')}</button></div></header><section class="content">${pageView()}</section></main></div>`;
}

function taskDetail() {
  const questions = state.task.questions;
  const wrong = questions.filter(question => question.teacherMarkingResult !== 'correct');
  const pending = questions.filter(question => question.reviewStatus === 'pending' || question.reviewStatus === 'needs_review');
  return `<div class="page-head"><div><div class="eyebrow">${state.role === 'teacher' ? '老师工作台' : '家长工作台'} · 任务详情</div><h1 class="page-title">${escapeHTML(state.task.sourceFileName)}</h1><p class="page-subtitle">李明 · 上传于 ${escapeHTML(state.task.uploadedAt)} · ${escapeHTML(state.task.subject)}</p></div><div class="head-actions"><button class="btn btn-secondary" data-action="more-actions">${icon('more')}更多操作</button></div></div><div class="card timeline-card">${taskTimeline(state.task.status)}</div>${state.task.saveStatus === 'failed' ? `<div class="notice notice-warn sync-warning">${icon('alert')}<div><strong>错题暂未同步到历史记录，但仍可继续完成练习。</strong><button class="btn btn-ghost btn-sm" data-action="resync">重新同步</button></div></div>` : ''}<div class="task-layout detail-task-layout"><div class="card"><div class="card-head"><div><h2>原始作业图片</h2><p>识别到 ${questions.length} 道题</p></div></div><div class="card-body">${worksheetPreview()}</div></div><div class="card"><div class="card-head"><div><h2>任务概览</h2><p>题目确认与处理进度</p></div>${statusPill(state.task.status)}</div><div class="card-body"><div class="stats-grid task-stats"><div class="stat-card"><div class="stat-top"><span>识别题目</span></div><div class="stat-value">${questions.length}</div></div><div class="stat-card"><div class="stat-top"><span>错题</span></div><div class="stat-value">${wrong.length}</div></div><div class="stat-card"><div class="stat-top"><span>待处理</span></div><div class="stat-value">${pending.length}</div></div></div><div class="detail-list"><div class="detail-item"><h3>下一步</h3><p>${state.task.status === 'needs_teacher_review' ? '等待老师完成数学复核。' : state.task.status === 'completed' ? '练习已经完成，可查看提交结果。' : '继续确认错题，选择需要强化的题目。'}</p><button class="btn btn-primary btn-sm mt-12" data-nav="${state.role === 'teacher' ? 'review' : 'confirm'}">${state.role === 'teacher' ? '返回待复核' : '去确认'}</button></div><div class="detail-item"><h3>辅助导出</h3><p>导出练习卷、教师答案或打印练习。</p><button class="btn btn-secondary btn-sm mt-12" data-action="more-actions">打开导出选项</button></div></div></div></div></div>`;
}

function createPracticeItems(selectedQuestions, settings) {
  const bank = state.practice.items.length ? state.practice.items : seed.practice.items;
  const items = [];
  selectedQuestions.forEach((question, questionIndex) => {
    const matching = bank.filter(item => item.knowledgePoint === question.knowledgePoint);
    const candidates = matching.length ? matching : bank;
    for (let index = 0; index < Number(settings.questionsPerMistake); index += 1) {
      const source = candidates[(questionIndex + index) % candidates.length];
      const requiredType = settings.questionType === 'mixed' ? source.questionType : settings.questionType;
      const typeSource = bank.find(item => item.questionType === requiredType) || source;
      const template = requiredType === source.questionType ? source : typeSource;
      items.push({ ...template, id: `generated-${Date.now()}-${items.length}`, questionNo: String(items.length + 1), difficulty: settings.difficulty, knowledgePoint: question.knowledgePoint });
    }
  });
  return items;
}

async function encodeWorksheetImage(file) {
  const sourceUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('图片读取失败，请重新选择。'));
    reader.readAsDataURL(file);
  });
  const image = new Image();
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(new Error('图片格式无法读取，请选择有效的 JPG 或 PNG 图片。'));
    image.src = sourceUrl;
  });
  const scale = Math.min(1, 1440 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('图片处理暂不可用，请重试。');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.68);
}

async function handleWorksheetFile(file) {
  if (!file) return;
  const valid = ['image/jpeg', 'image/png'].includes(file.type);
  if (!valid) {
    state.task.uploadError = '请选择 JPG 或 PNG 格式的图片。';
    render();
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    state.task.uploadError = '图片超过 10MB。可以压缩图片后再上传。';
    render();
    return;
  }
  state.task.uploadError = '';
  state.task.uploadProgress = 18;
  state.task.status = 'recognizing';
  state.task.sourceFileName = file.name.replace(/[<>"']/g, '').slice(0, 120) || '数学作业.jpg';
  state.task.uploadedAt = new Date().toLocaleString('zh-CN', { hour12: false });
  persistState();
  render();
  try {
    const imageData = await encodeWorksheetImage(file);
    state.task.sourceImageDataUrl = imageData;
    state.task.uploadProgress = 68;
    persistState();
    render();
    window.setTimeout(() => {
      state.task.uploadProgress = 100;
      state.task.status = state.task.questions.length ? 'needs_confirmation' : 'needs_confirmation';
      state.task.saveStatus = 'failed';
      state.task.saveErrorMessage = '历史记录同步暂不可用';
      persistState();
      render();
      showToast('图片已上传并完成模拟识别，请确认结果。', 'success');
    }, 700);
  } catch (error) {
    state.task.status = 'uploaded';
    state.task.uploadProgress = 0;
    state.task.uploadError = error instanceof Error ? error.message : '图片处理失败，请重试。';
    persistState();
    render();
  }
}

function closeConflictTaskIfResolved() {
  const unresolved = state.task.questions.some(question => ['teacher_marking_conflict', 'needs_review'].includes(question.conflictStatus));
  if (unresolved) state.task.status = 'needs_teacher_review';
  else if (state.practice.status === 'completed') state.task.status = 'completed';
  else if (state.practice.status === 'in_progress') state.task.status = 'in_progress';
  else if (state.practice.status === 'assigned' || state.practice.status === 'submitted') state.task.status = 'assigned';
  else state.task.status = 'confirmed';
}

function exportWordDocument(title, items, includeAnswers) {
  const rows = items.map(item => `<article><h2>第 ${escapeHTML(item.questionNo)} 题</h2><p>${escapeHTML(item.questionText)}</p>${includeAnswers ? `<p><strong>答案：</strong>${escapeHTML(item.correctAnswer)}</p><p><strong>解析：</strong>${escapeHTML(item.explanation)}</p>` : ''}</article>`).join('');
  const documentHTML = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHTML(title)}</title><style>body{font-family:Arial,"Microsoft YaHei",sans-serif;line-height:1.8;margin:32px;color:#172334}h1{font-size:22px}h2{font-size:16px}article{padding:12px 0;border-bottom:1px solid #d9e1ea}</style></head><body><h1>${escapeHTML(title)}</h1>${rows}</body></html>`;
  const blob = new Blob(['\ufeff', documentHTML], { type: 'application/msword;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${title}_${new Date().toISOString().slice(0, 10)}.doc`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  showToast('文件已生成并开始下载。', 'success');
}

function exportOptions() {
  const items = [
    `<button class="btn btn-secondary" data-action="export-student">${icon('download')}导出学生练习卷</button>`,
    `<button class="btn btn-secondary" data-action="print-practice">${icon('clipboard')}打印练习 / 保存为 PDF</button>`,
    `<button class="btn btn-secondary" data-action="copy-link">${icon('send')}复制分享链接</button>`
  ];
  if (state.role !== 'student') items.splice(1, 0, `<button class="btn btn-secondary" data-action="export-teacher">${icon('download')}导出教师答案与解析</button>`);
  showModal('更多操作', `<div class="detail-list export-options">${items.join('')}</div>`);
}

function handleAction(action, id, element) {
  const question = state.task.questions.find(item => item.id === id);
  if (['confirm-question', 'send-review', 'edit-question', 'not-mistake', 'resync'].includes(action) && state.role !== 'parent') return showToast('当前角色没有家长确认权限。', 'warn');
  if (['teacher-confirm', 'teacher-correct', 'teacher-reject', 'publish', 'choose-knowledge', 'remove-assignment-point'].includes(action) && state.role !== 'teacher') return showToast('当前角色没有老师复核或布置权限。', 'warn');
  if (action === 'generate' && !permissions[state.role].createPractice) return showToast('当前角色没有生成练习权限。', 'warn');
  if (action === 'choose-file') return document.querySelector('#file-input')?.click();
  if (action === 'notifications') return showToast('暂无新的通知。');
  if (action === 'help') return showToast('遇到识别冲突时，可以提交老师复核。');
  if (action === 'resync') {
    state.task.saveStatus = 'success';
    state.task.saveErrorMessage = '';
    persistState(); render();
    return showToast('已重新同步到历史记录。', 'success');
  }
  if (action === 'confirm-question' && question) {
    question.reviewStatus = 'parent_confirmed';
    state.selectedQuestions = [...new Set([...state.selectedQuestions, question.id])];
    closeConflictTaskIfResolved();
    persistState(); render();
    return showToast(`第 ${question.questionNo} 题已确认。`, 'success');
  }
  if (action === 'send-review' && question) {
    question.reviewStatus = 'needs_review';
    question.conflictStatus = question.conflictStatus === 'none' ? 'needs_review' : question.conflictStatus;
    state.task.status = 'needs_teacher_review';
    state.focusQuestionId = question.id;
    persistState(); render();
    return showToast('已提交老师复核，确认前不会进入练习。', 'success');
  }
  if (action === 'not-mistake' && question) {
    state.task.questions = state.task.questions.filter(item => item.id !== id);
    state.selectedQuestions = state.selectedQuestions.filter(item => item !== id);
    closeConflictTaskIfResolved();
    persistState(); render();
    return showToast('已从错题中移除。');
  }
  if (action === 'edit-question' && question) {
    return showModal('修改识别内容', `<div class="field"><label for="edit-text">题目内容</label><textarea id="edit-text">${escapeHTML(question.questionText)}</textarea></div><div class="field"><label for="edit-answer">学生作答</label><input id="edit-answer" value="${escapeHTML(question.studentWork)}" /></div><div class="field"><label for="edit-kp">知识点</label><input id="edit-kp" value="${escapeHTML(question.knowledgePoint || '')}" /></div>`, () => {
      const current = state.task.questions.find(item => item.id === id);
      if (!current) return;
      current.questionText = document.querySelector('#edit-text')?.value.trim() || current.questionText;
      current.studentWork = document.querySelector('#edit-answer')?.value.trim() || current.studentWork;
      current.knowledgePoint = document.querySelector('#edit-kp')?.value.trim() || current.knowledgePoint;
      current.recognitionConfidence = 'high';
      persistState(); render(); showToast('识别内容已更新。', 'success');
    });
  }
  if (action === 'generate') {
    const selected = state.task.questions.filter(item => state.selectedQuestions.includes(item.id) && practiceEligible(item));
    if (!selected.length) return showToast('请先确认至少一道错题，再生成练习。', 'warn');
    state.generating = true;
    state.task.status = state.task.questions.some(item => ['teacher_marking_conflict', 'needs_review'].includes(item.conflictStatus)) ? 'needs_teacher_review' : 'generating';
    persistState(); render();
    window.setTimeout(() => {
      const items = createPracticeItems(selected, state.practiceSettings);
      if (!items.length) {
        state.generating = false;
        state.task.status = 'ready_for_practice';
        persistState(); render();
        return showToast('暂时没有匹配的练习题，请调整错题或重试。', 'warn');
      }
      state.practice = {
        ...state.practice,
        id: `ps-${Date.now()}`,
        title: `${selected[0].knowledgePoint}专项练习`,
        knowledgePoints: [...new Set(selected.map(item => item.knowledgePoint))],
        totalQuestions: items.length,
        difficulty: state.practiceSettings.difficulty,
        status: 'assigned',
        dueAt: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
        items
      };
      state.draftAnswers = {};
      state.submission = null;
      state.currentQuestion = 0;
      state.generating = false;
      closeConflictTaskIfResolved();
      persistState(); render();
      showToast('练习已生成，可在学生端开始作答。', 'success');
    }, 650);
    return;
  }
  if (action === 'prev') { state.currentQuestion = Math.max(0, state.currentQuestion - 1); persistState(); render(); return; }
  if (action === 'next') { state.currentQuestion = Math.min(state.practice.items.length - 1, state.currentQuestion + 1); persistState(); render(); return; }
  if (action === 'submit-practice') {
    const unanswered = state.practice.items.filter(item => !String(state.draftAnswers[item.id] || '').trim());
    if (unanswered.length) return showModal('还有题目没有作答', `<div class="notice notice-warn">${icon('alert')}<div><strong>还有 ${unanswered.length} 道题未作答</strong>你可以返回补充，也可以提交当前答案。</div></div>`, () => submitPractice());
    return submitPractice();
  }
  if (action === 'upload-handwriting') return document.querySelector('#handwriting-input')?.click();
  if (action === 'remove-handwriting') {
    const item = state.practice.items[state.currentQuestion];
    if (item) delete state.handwritingByItem[item.id];
    persistState(); render(); return;
  }
  if (action === 'again') {
    state.submission = null; state.currentQuestion = 0; state.draftAnswers = {};
    state.practice.status = 'in_progress'; closeConflictTaskIfResolved();
    persistState(); render(); return;
  }
  if (action === 'review-question') {
    if (state.role !== 'teacher') return showToast('只有老师可以处理数学复核。', 'warn');
    state.focusQuestionId = id || state.task.questions.find(item => item.conflictStatus !== 'none')?.id;
    state.page = 'taskDetail'; persistState(); render(); return;
  }
  if (action === 'teacher-confirm' && question) {
    question.reviewStatus = 'teacher_confirmed';
    question.conflictStatus = 'none';
    question.verifiedCorrectAnswer = document.querySelector('#review-answer')?.value.trim() || question.verifiedCorrectAnswer;
    question.knowledgePoint = document.querySelector('#review-knowledge')?.value || question.knowledgePoint;
    question.knowledgeExplanation = document.querySelector('#review-note')?.value.trim() || question.knowledgeExplanation;
    if (question.aiMathVerdict === 'insufficient_information' || question.aiMathVerdict === 'correct') {
      question.teacherMarkingResult = question.aiMathVerdict === 'correct' ? 'correct' : 'unclear';
      state.selectedQuestions = state.selectedQuestions.filter(item => item !== id);
    } else {
      question.teacherMarkingResult = 'incorrect';
    }
    closeConflictTaskIfResolved(); persistState(); render();
    return showToast('AI 判断已由老师复核并记录。', 'success');
  }
  if (action === 'teacher-correct' && question) {
    const answer = document.querySelector('#review-answer')?.value.trim();
    if (!answer) return showToast('请填写最终正确答案后再保存。', 'warn');
    question.reviewStatus = 'teacher_corrected';
    question.conflictStatus = 'none';
    question.aiMathVerdict = 'incorrect';
    question.teacherMarkingResult = 'incorrect';
    question.verifiedCorrectAnswer = answer;
    question.knowledgePoint = document.querySelector('#review-knowledge')?.value || question.knowledgePoint;
    question.knowledgeExplanation = document.querySelector('#review-note')?.value.trim() || question.knowledgeExplanation;
    closeConflictTaskIfResolved(); persistState(); render();
    return showToast('老师复核结果已保存。', 'success');
  }
  if (action === 'teacher-reject' && question) {
    question.reviewStatus = 'pending';
    state.task.status = 'recognizing';
    persistState(); render();
    window.setTimeout(() => {
      question.recognitionConfidence = 'medium';
      state.task.status = 'needs_teacher_review';
      persistState(); render();
      showToast('已完成模拟重新识别，请再次核对。', 'success');
    }, 700);
    return;
  }
  if (action === 'publish') {
    const assignment = state.assignment;
    if (!assignment.knowledgePoints.length) return showToast('请至少选择一个知识点。', 'warn');
    return showModal('确认发布练习', `<div class="notice notice-info">${icon('send')}<div><strong>${assignment.audience === 'class' ? '初一（3）班 45 人' : `指定学生：${escapeHTML(demoStudents.find(student => student.id === assignment.audience)?.name || '李明')}`}</strong>${escapeHTML(assignment.count)} 道题 · 截止 ${escapeHTML(assignment.dueAt)} · ${assignment.knowledgePoints.map(escapeHTML).join('、')}</div></div>`, () => {
      state.practice = { ...state.practice, title: `${assignment.knowledgePoints[0]}班级练习`, totalQuestions: Number(assignment.count), difficulty: assignment.difficulty, knowledgePoints: [...assignment.knowledgePoints], status: 'assigned', assignedBy: 'tea-001', assignedAt: new Date().toISOString(), dueAt: assignment.dueAt };
      state.task.status = 'assigned'; persistState(); render(); showToast('练习已发布，学生端已更新。', 'success');
    });
  }
  if (action === 'refresh') { persistState(); render(); return showToast('复核列表已刷新。', 'success'); }
  if (action === 'reset-review-filters') { state.reviewFilters = { student: 'all', knowledge: 'all', conflict: 'all', confidence: 'all' }; persistState(); render(); return; }
  if (action === 'drilldown' || action === 'student-drill') {
    const label = action === 'student-drill' ? (element?.textContent.trim() || '李明') : (element?.querySelector(':scope > span')?.textContent.trim() || element?.textContent.trim());
    state.diagnosisFilter = label; state.page = 'diagnosisQuestions'; persistState(); render(); return;
  }
  if (action === 'student-detail') { state.focusStudentId = id || 'stu-001'; state.page = 'studentDetail'; persistState(); render(); return; }
  if (action === 'choose-knowledge') {
    const choices = ['绝对值方程', '一元一次方程', '平行线与角', '整式加减'];
    const next = choices.find(point => !state.assignment.knowledgePoints.includes(point));
    if (!next) return showToast('已选择演示中的全部知识点。');
    state.assignment.knowledgePoints.push(next); persistState(); render(); return showToast(`已添加${next}。`, 'success');
  }
  if (action === 'remove-assignment-point') { state.assignment.knowledgePoints = state.assignment.knowledgePoints.filter(point => point !== id); persistState(); render(); return; }
  if (action === 'export' || action === 'more-actions') {
    if (state.role === 'student' && state.page !== 'results' && state.page !== 'progress') return showToast('当前页面暂不支持导出。', 'warn');
    return exportOptions();
  }
  if (action === 'export-student') return exportWordDocument('学生练习卷', state.practice.items, false);
  if (action === 'export-teacher') {
    if (state.role === 'student') return showToast('当前角色不能导出教师答案。', 'warn');
    return exportWordDocument('教师答案与解析', state.practice.items, true);
  }
  if (action === 'print-practice') {
    const sheet = document.createElement('section');
    sheet.className = 'print-sheet';
    sheet.innerHTML = `<h1>${escapeHTML(state.practice.title)}</h1>${state.practice.items.map(item => `<article><h2>第 ${escapeHTML(item.questionNo)} 题</h2><p>${escapeHTML(item.questionText)}</p>${item.options ? `<ol type="A">${item.options.map(option => `<li>${escapeHTML(option)}</li>`).join('')}</ol>` : '<div class="answer-lines"></div>'}</article>`).join('')}`;
    document.body.append(sheet);
    document.body.classList.add('printing');
    window.print();
    document.body.classList.remove('printing');
    sheet.remove();
    return;
  }
  if (action === 'copy-link') {
    const link = window.location.href.split('#')[0];
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(link).then(() => showToast('分享链接已复制。', 'success')).catch(() => showToast('当前浏览器不支持复制，请手动复制地址栏链接。', 'warn'));
    else showToast('请手动复制浏览器地址栏链接。', 'warn');
    return;
  }
  if (action === 'zoom') return showModal('作业图片', `<div class="zoomed-image">${state.task.sourceImageDataUrl ? `<img src="${state.task.sourceImageDataUrl}" alt="${escapeHTML(state.task.sourceFileName)}" style="transform:rotate(${Number(state.task.imageRotation || 0)}deg)"/>` : '<div class="worksheet-lines"></div>'}</div>`);
  if (action === 'rotate') { state.task.imageRotation = (Number(state.task.imageRotation || 0) + 90) % 360; persistState(); render(); return; }
  if (action === 'timeline') return showToast(`任务状态：${statusLabel(id)}。`);
}

function bindWorkflowEvents() {
  if (document.body.dataset.workflowEvents === 'bound') return;
  document.body.dataset.workflowEvents = 'bound';
  document.body.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target.closest('[data-nav], [data-action], [data-question-index]') : null;
    if (!target) return;
    if (target.dataset.questionIndex !== undefined) {
      if (state.role !== 'student' || state.submission) return showToast('当前不能切换作答题目。', 'warn');
      state.currentQuestion = Number(target.dataset.questionIndex);
      persistState(); render(); return;
    }
    if (target.dataset.nav) {
      const destination = target.dataset.nav;
      const allowed = roleMeta[state.role].nav.some(item => item[0] === destination)
        || (destination === 'taskDetail' && ['parent', 'teacher'].includes(state.role))
        || (destination === 'results' && state.role === 'student' && Boolean(state.submission))
        || (destination === 'practiceDetail' && state.role === 'student');
      if (!allowed) return showToast('当前角色没有访问该页面的权限。', 'warn');
      if (destination === 'practiceDetail' && state.practice.status === 'completed' && state.submission) state.page = 'results';
      else state.page = destination;
      persistState(); render(); return;
    }
    handleAction(target.dataset.action, target.dataset.id || target.dataset.status, target);
  });
  document.body.addEventListener('change', event => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
    if (target.id === 'role-switch') {
      if (!['student', 'parent', 'teacher'].includes(target.value)) return;
      state.role = target.value; state.page = roleMeta[state.role].nav[0][0];
      persistState(); render(); showToast(`已切换为${roleMeta[state.role].role}视角。`, 'success'); return;
    }
    if (target.dataset.questionCheck) {
      const id = target.dataset.questionCheck;
      state.selectedQuestions = target.checked ? [...new Set([...state.selectedQuestions, id])] : state.selectedQuestions.filter(item => item !== id);
      persistState(); render(); return;
    }
    if (target.dataset.setting) {
      const key = target.dataset.setting;
      state.practiceSettings[key] = target.type === 'checkbox' ? target.checked : key === 'questionsPerMistake' ? Number(target.value) : target.value;
      persistState(); render(); return;
    }
    if (target.dataset.reviewFilter) { state.reviewFilters[target.dataset.reviewFilter] = target.value; persistState(); render(); return; }
    if (target.dataset.assignment) { state.assignment[target.dataset.assignment] = target.value; persistState(); render(); return; }
    if (target.dataset.studentStatus) { filterStudentRows(); return; }
    if (target.id === 'file-input') { void handleWorksheetFile(target.files?.[0]); target.value = ''; return; }
    if (target.id === 'handwriting-input') { void handleHandwritingFile(target.files?.[0]); target.value = ''; return; }
    if (target.name === 'answer') {
      const item = state.practice.items[state.currentQuestion];
      if (item) state.draftAnswers[item.id] = target.value;
      persistState(); render();
    }
  });
  document.body.addEventListener('input', event => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;
    if (target.id === 'answer-input') {
      const item = state.practice.items[state.currentQuestion];
      if (item) state.draftAnswers[item.id] = target.value;
      persistState();
    }
    if (target.matches('[data-student-search]')) filterStudentRows();
  });
  document.body.addEventListener('dragover', event => {
    const zone = event.target instanceof Element ? event.target.closest('[data-dropzone]') : null;
    if (zone) event.preventDefault();
  });
  document.body.addEventListener('drop', event => {
    const zone = event.target instanceof Element ? event.target.closest('[data-dropzone]') : null;
    if (!zone) return;
    event.preventDefault();
    if (state.role === 'parent' && permissions.parent.uploadWorksheet) void handleWorksheetFile(event.dataTransfer?.files?.[0]);
  });
}

function filterStudentRows() {
  const search = document.querySelector('[data-student-search]')?.value.trim().toLowerCase() || '';
  const status = document.querySelector('[data-student-status]')?.value || 'all';
  let visible = 0;
  document.querySelectorAll('[data-student-row]').forEach(row => {
    const matches = row.dataset.studentName.toLowerCase().includes(search)
      && (status === 'all' || row.dataset.studentStatus === status);
    row.classList.toggle('hide', !matches);
    if (matches) visible += 1;
  });
  document.querySelector('[data-student-empty]')?.classList.toggle('hide', visible !== 0);
}

async function handleHandwritingFile(file) {
  const item = state.practice.items[state.currentQuestion];
  if (!file || !item) return;
  if (!['image/jpeg', 'image/png'].includes(file.type) || file.size > 10 * 1024 * 1024) return showToast('请选择 10MB 以内的 JPG 或 PNG 图片。', 'warn');
  try {
    state.handwritingByItem[item.id] = await encodeWorksheetImage(file);
    persistState(); render(); showToast('手写解题图片已添加。', 'success');
  } catch (error) {
    showToast(error instanceof Error ? error.message : '图片处理失败，请重试。', 'warn');
  }
}

function submitPractice() {
  const results = state.practice.items.map(item => ({
    practiceItemId: item.id,
    studentAnswer: state.draftAnswers[item.id] || '',
    correctAnswer: item.correctAnswer,
    isCorrect: normalizeAnswer(state.draftAnswers[item.id] || '') === normalizeAnswer(item.correctAnswer),
    explanation: item.explanation
  }));
  state.submission = { id: `sub-${Date.now()}`, practiceSetId: state.practice.id, studentId: 'stu-001', answers: { ...state.draftAnswers }, submittedAt: new Date().toISOString(), score: Math.round(results.filter(result => result.isCorrect).length / Math.max(results.length, 1) * 100), results };
    state.practice.status = 'completed'; closeConflictTaskIfResolved(); state.page = 'results';
  persistState(); render(); showToast('已提交，答案和解析现已开放。', 'success');
}

function normalizeAnswer(value) {
  return String(value).replace(/[\s，,。；;、]/g, '').replace(/[或和]/g, '/').toLowerCase();
}

function showModal(title, body, onConfirm) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${escapeHTML(title)}"><div class="modal-head"><h2>${escapeHTML(title)}</h2><button class="close-btn" data-close aria-label="关闭">${icon('close')}</button></div><div class="modal-body">${body}</div>${onConfirm ? '<div class="modal-foot"><button class="btn btn-secondary" data-close>取消</button><button class="btn btn-primary" data-confirm>确认</button></div>' : ''}</div>`;
  document.body.append(wrap);
  wrap.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => wrap.remove()));
  wrap.addEventListener('click', event => { if (event.target === wrap) wrap.remove(); });
  if (onConfirm) wrap.querySelector('[data-confirm]').addEventListener('click', () => { onConfirm(); wrap.remove(); });
  wrap.querySelector('[data-confirm], [data-close]')?.focus();
}

ensureDemoState();
parentHome = parentHome;
parentUpload = parentUpload;
parentConfirm = parentConfirm;
parentPractice = parentPractice;
questionCard = questionCard;
taskTimeline = taskTimeline;
studentToday = studentToday;
studentPractice = studentPractice;
studentResults = studentResults;
studentMistakes = studentMistakes;
teacherReview = teacherReview;
teacherReviewDetail = teacherReviewDetail;
teacherStudents = teacherStudents;
teacherAssign = teacherAssignment;
teacherView = teacherView;
pageTitle = pageTitle;
handleAction = handleAction;
bindEvents = bindWorkflowEvents;
submitPractice = submitPractice;
showModal = showModal;
persistState();
render();
