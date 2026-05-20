import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import 'antd/dist/reset.css';
import {
  AudioOutlined,
  BarChartOutlined,
  BookOutlined,
  CameraOutlined,
  CheckCircleOutlined,
  CloudUploadOutlined,
  DeleteOutlined,
  EditOutlined,
  FileExcelOutlined,
  PlusOutlined,
  PlayCircleOutlined,
  ReadOutlined,
  RobotOutlined,
  SaveOutlined,
  ScheduleOutlined,
  SoundOutlined,
  TrophyOutlined,
  UserOutlined
} from '@ant-design/icons';
import {
  Alert,
  App as AntdApp,
  Button,
  Card,
  Checkbox,
  Col,
  ConfigProvider,
  Divider,
  Empty,
  Form,
  Input,
  Layout,
  List,
  Modal,
  InputNumber,
  Popconfirm,
  Progress,
  Row,
  Select,
  Space,
  Statistic,
  Steps,
  Table,
  Tabs,
  Tag,
  Typography,
  message
} from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { apiRequest, downloadCsv } from './api';
import {
  AnswerResult,
  AnswerSheetResult,
  CharacterItem,
  ClassRoom,
  DictationTask,
  DictationPackItem,
  LearningPack,
  Lesson,
  MaterialExtractResult,
  MistakeRecord,
  PronunciationEvaluation,
  ReviewAnswer,
  Student,
  Submission,
  TaskReport
} from './types';
import './styles.css';

const { Header, Content } = Layout;
const { Title, Text } = Typography;
const DEFAULT_CLASS_ID = 'class_1_1';
const DEFAULT_TEACHER_ID = 'teacher_demo';

function useBootstrap() {
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  const loadStudents = useCallback(async (classId?: string) => {
    if (!classId) {
      setStudents([]);
      return;
    }
    const studentRows = await apiRequest<Student[]>(`/classes/${classId}/students`);
    setStudents(studentRows);
  }, []);

  const reload = useCallback(async (preferredClassId?: string) => {
    setLoading(true);
    try {
      const [classRows, lessonRows] = await Promise.all([
        apiRequest<ClassRoom[]>('/classes'),
        apiRequest<Lesson[]>('/materials/lessons')
      ]);
      setClasses(classRows);
      setLessons(lessonRows);
      const currentClassId = preferredClassId || selectedClassId;
      const nextClassId = classRows.some((item) => item.id === currentClassId)
        ? currentClassId
        : classRows[0]?.id || DEFAULT_CLASS_ID;
      setSelectedClassId(nextClassId);
      await loadStudents(nextClassId);
    } finally {
      setLoading(false);
    }
  }, [loadStudents, selectedClassId]);

  useEffect(() => {
    reload().catch((error) => message.error(error.message));
  }, []);

  const changeClass = useCallback(async (classId: string) => {
    setSelectedClassId(classId);
    setLoading(true);
    try {
      await loadStudents(classId);
    } finally {
      setLoading(false);
    }
  }, [loadStudents]);

  return { classes, lessons, students, selectedClassId, loading, reload, changeClass };
}

function splitLines(value?: string) {
  return (value || '')
    .split(/[\n、,，;；]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function readFileAsText(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('文件读取失败'));
    reader.readAsText(file, 'utf-8');
  });
}

function parseConfusingChars(value?: string): Array<{ char: string; reason: string }> {
  return (value || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [char, ...reasonParts] = line.split(/[:：]/);
      return { char: (char || '').trim(), reason: reasonParts.join('：').trim() || '教师补充的形近字辨析。' };
    })
    .filter((item) => item.char);
}

function confusingCharsToText(value?: Array<{ char: string; reason: string }>) {
  return (value || []).map((item) => `${item.char}：${item.reason}`).join('\n');
}

function speakChinese(text?: string) {
  if (!text || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'zh-CN';
  utterance.rate = 0.88;
  window.speechSynthesis.speak(utterance);
}

function TeacherStudio({
  classes,
  lessons,
  selectedClassId,
  onClassChange,
  onDataChanged,
  onTaskCreated
}: {
  classes: ClassRoom[];
  lessons: Lesson[];
  selectedClassId?: string;
  onClassChange: (classId: string) => Promise<void>;
  onDataChanged: (preferredClassId?: string) => Promise<void>;
  onTaskCreated: (task: DictationTask) => void;
}) {
  const [form] = Form.useForm();
  const [taskForm] = Form.useForm();
  const [charForm] = Form.useForm();
  const [dictationForm] = Form.useForm();
  const [pack, setPack] = useState<LearningPack | null>(null);
  const [task, setTask] = useState<DictationTask | null>(null);
  const [report, setReport] = useState<TaskReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedLessonId, setSelectedLessonId] = useState<string | undefined>(lessons[0]?.id);
  const [charEditorOpen, setCharEditorOpen] = useState(false);
  const [editingCharIndex, setEditingCharIndex] = useState<number | null>(null);
  const [dictationEditorOpen, setDictationEditorOpen] = useState(false);
  const [editingDictationIndex, setEditingDictationIndex] = useState<number | null>(null);
  const [learningCardItem, setLearningCardItem] = useState<CharacterItem | null>(null);
  const materialImageInputRef = useRef<HTMLInputElement>(null);
  const wordListInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (lessons[0] && !selectedLessonId) {
      setSelectedLessonId(lessons[0].id);
    }
  }, [lessons, selectedLessonId]);

  const selectedLesson = lessons.find((item) => item.id === selectedLessonId);

  useEffect(() => {
    if (selectedLesson) {
      form.setFieldsValue({
        grade: selectedLesson.grade,
        volume: selectedLesson.volume,
        unit: `第${selectedLesson.unit_no}单元`,
        title: selectedLesson.title,
        content: selectedLesson.content
      });
    }
  }, [form, selectedLesson]);

  useEffect(() => {
    if (!pack) return;
    taskForm.setFieldsValue({
      title: `${pack.content.lesson.title} AI 听写任务`,
      class_id: selectedClassId || classes[0]?.id || DEFAULT_CLASS_ID,
      question_type: 'word',
      selected_answers: pack.content.dictation_items.map((item) => item.answer),
      interval_seconds: 8,
      repeat: 1,
      deadline: ''
    });
  }, [pack, selectedClassId, taskForm]);

  const uploadMaterialImage = async (file?: File) => {
    if (!file) return;
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const result = await apiRequest<MaterialExtractResult>('/materials/extract-image', {
        method: 'POST',
        body: formData
      });
      form.setFieldsValue({ content: result.extracted_text });
      message.success(`教材图片已识别，置信度 ${Math.round(result.confidence * 100)}%`);
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleMaterialImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    uploadMaterialImage(file).catch((error) => message.error(error.message));
  };

  const importWordList = async (file?: File) => {
    if (!file) return;
    try {
      const text = await readFileAsText(file);
      const words = splitLines(text);
      if (!words.length) {
        message.warning('词语清单为空');
        return;
      }
      const current = String(form.getFieldValue('content') || '').trim();
      const nextContent = [current, `自定义词语：${words.join('、')}`].filter(Boolean).join('\n');
      form.setFieldsValue({ content: nextContent });
      message.success(`已导入 ${words.length} 个词语`);
    } catch (error) {
      message.error((error as Error).message);
    }
  };

  const handleWordListImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    importWordList(file).catch((error) => message.error(error.message));
  };

  const generatePack = async () => {
    const values = await form.validateFields();
    setLoading(true);
    try {
      const response = await apiRequest<{ id: string; status: string; ai_status: string; content: LearningPack['content'] }>(
        '/learning-packs/generate',
        {
          method: 'POST',
          body: JSON.stringify({
            ...values,
            lesson_id: selectedLessonId,
            teacher_id: DEFAULT_TEACHER_ID
          })
        }
      );
      setPack({
        id: response.id,
        title: values.title,
        status: response.status,
        ai_status: response.ai_status,
        content: response.content
      });
      setTask(null);
      setReport(null);
      message.success(response.ai_status === 'success' ? 'AI 学习包已生成' : '已使用演示兜底规则生成学习包');
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const savePackContent = async (nextContent: LearningPack['content'], successText = '学习包已更新') => {
    if (!pack) return;
    setLoading(true);
    try {
      const updated = await apiRequest<LearningPack>(`/learning-packs/${pack.id}`, {
        method: 'PUT',
        body: JSON.stringify(nextContent)
      });
      setPack(updated);
      message.success(successText);
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const openCharEditor = (index: number | null) => {
    setEditingCharIndex(index);
    setCharEditorOpen(true);
    const item = index === null ? undefined : pack?.content.characters[index];
    charForm.setFieldsValue(
      item
        ? {
            ...item,
            words_text: item.words?.join('、'),
            stroke_order_text: item.stroke_order?.join('、'),
            mistakes_text: item.common_mistakes?.join('\n'),
            confusing_text: confusingCharsToText(item.confusing_chars)
          }
        : {
            char: '',
            display_pinyin: '',
            pinyin: '',
            radical: '',
            structure: '',
            stroke_count: undefined,
            stroke_order_text: '',
            words_text: '',
            simple_sentence: '',
            mistakes_text: '',
            confusing_text: '',
            needs_teacher_review: false
          }
    );
  };

  const saveChar = async () => {
    if (!pack) return;
    const values = await charForm.validateFields();
    const item: CharacterItem = {
      char: values.char,
      pinyin: values.pinyin || values.display_pinyin || '',
      display_pinyin: values.display_pinyin || values.pinyin || '',
      radical: values.radical,
      structure: values.structure,
      stroke_count: Number(values.stroke_count || 0),
      stroke_order: splitLines(values.stroke_order_text),
      words: splitLines(values.words_text),
      simple_sentence: values.simple_sentence,
      common_mistakes: splitLines(values.mistakes_text),
      confusing_chars: parseConfusingChars(values.confusing_text),
      needs_teacher_review: Boolean(values.needs_teacher_review)
    };
    const characters = [...pack.content.characters];
    if (editingCharIndex === null) {
      characters.push(item);
    } else {
      characters[editingCharIndex] = item;
    }
    await savePackContent({ ...pack.content, characters }, '生字卡片已保存');
    setCharEditorOpen(false);
  };

  const deleteChar = async (index: number) => {
    if (!pack) return;
    const characters = pack.content.characters.filter((_, current) => current !== index);
    await savePackContent({ ...pack.content, characters }, '生字已删除');
  };

  const openDictationEditor = (index: number | null) => {
    setEditingDictationIndex(index);
    setDictationEditorOpen(true);
    const item = index === null ? undefined : pack?.content.dictation_items[index];
    dictationForm.setFieldsValue(
      item || {
        type: 'word',
        answer: '',
        prompt_text: '',
        audio_text: '',
        difficulty: 1,
        char: ''
      }
    );
  };

  const saveDictationItem = async () => {
    if (!pack) return;
    const values = await dictationForm.validateFields();
    const item: DictationPackItem = {
      type: values.type || 'word',
      answer: values.answer,
      prompt_text: values.prompt_text || `请写：${values.answer}`,
      audio_text: values.audio_text || values.prompt_text || `请写：${values.answer}`,
      difficulty: Number(values.difficulty || 1),
      char: values.char || values.answer?.[0] || ''
    };
    const dictation_items = [...pack.content.dictation_items];
    if (editingDictationIndex === null) {
      dictation_items.push(item);
    } else {
      dictation_items[editingDictationIndex] = item;
    }
    await savePackContent({ ...pack.content, dictation_items }, '听写清单已保存');
    setDictationEditorOpen(false);
  };

  const deleteDictationItem = async (index: number) => {
    if (!pack) return;
    const dictation_items = pack.content.dictation_items.filter((_, current) => current !== index);
    await savePackContent({ ...pack.content, dictation_items }, '听写题已删除');
  };

  const confirmAndPublish = async () => {
    if (!pack) return;
    const values = await taskForm.validateFields();
    if (!values.selected_answers?.length) {
      message.warning('请至少选择一个听写词语');
      return;
    }
    setLoading(true);
    try {
      await apiRequest<LearningPack>(`/learning-packs/${pack.id}/confirm`, {
        method: 'POST',
        body: JSON.stringify({ teacher_id: DEFAULT_TEACHER_ID })
      });
      const created = await apiRequest<DictationTask>('/dictation-tasks', {
        method: 'POST',
        body: JSON.stringify({
          class_id: values.class_id || selectedClassId || classes[0]?.id || DEFAULT_CLASS_ID,
          teacher_id: DEFAULT_TEACHER_ID,
          learning_pack_id: pack.id,
          title: values.title,
          mode: 'classroom',
          question_type: values.question_type,
          selected_answers: values.selected_answers,
          deadline: values.deadline ? new Date(values.deadline).toISOString() : undefined,
          settings: {
            speed: 0.9,
            repeat: values.repeat,
            interval_seconds: values.interval_seconds
          }
        })
      });
      const published = await apiRequest<DictationTask>(`/dictation-tasks/${created.id}/publish`, {
        method: 'POST'
      });
      setTask(published);
      onTaskCreated(published);
      message.success('听写任务已发布到班级');
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const loadReport = async (taskId: string) => {
    setLoading(true);
    try {
      const data = await apiRequest<TaskReport>(`/reports/tasks/${taskId}`);
      setReport(data);
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      title: '生字',
      dataIndex: 'char',
      width: 92,
      render: (value: string) => <span className="hanzi tianzi">{value}</span>
    },
    { title: '拼音', dataIndex: 'display_pinyin', width: 100 },
    { title: '部首', dataIndex: 'radical', width: 80 },
    { title: '结构', dataIndex: 'structure', width: 110 },
    { title: '组词', dataIndex: 'words', render: (value: string[]) => value?.join('、') },
    {
      title: '易错提示',
      dataIndex: 'common_mistakes',
      render: (value?: string[]) => value?.[0] || '待教师补充'
    },
    {
      title: '状态',
      dataIndex: 'needs_teacher_review',
      width: 110,
      render: (value?: boolean) => (value ? <Tag color="gold">待确认</Tag> : <Tag color="green">可用</Tag>)
    },
    {
      title: '操作',
      width: 210,
      render: (_: unknown, record: CharacterItem, index: number) => (
        <Space size={4} wrap>
          <Button size="small" icon={<BookOutlined />} onClick={() => setLearningCardItem(record)}>
            卡片
          </Button>
          <Button size="small" icon={<EditOutlined />} onClick={() => openCharEditor(index)}>
            编辑
          </Button>
          <Popconfirm title="删除这个生字？" onConfirm={() => deleteChar(index)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      )
    }
  ];
  const dictationColumns = [
    { title: '序号', width: 70, render: (_: unknown, __: DictationPackItem, index: number) => index + 1 },
    { title: '题型', dataIndex: 'type', width: 90, render: (value: string) => questionTypeLabel(value) },
    { title: '答案', dataIndex: 'answer', render: (value: string) => <HanziGridWord value={value} /> },
    { title: '朗读文本', dataIndex: 'audio_text' },
    { title: '难度', dataIndex: 'difficulty', width: 80 },
    {
      title: '操作',
      width: 150,
      render: (_: unknown, __: DictationPackItem, index: number) => (
        <Space size={4}>
          <Button size="small" icon={<EditOutlined />} onClick={() => openDictationEditor(index)}>
            编辑
          </Button>
          <Popconfirm title="删除这道听写题？" onConfirm={() => deleteDictationItem(index)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      )
    }
  ];
  const teacherStep = task ? 3 : pack ? 1 : 0;

  return (
    <Space direction="vertical" size={18} className="full">
      <Card className="command-card">
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} lg={10}>
            <div className="section-kicker">教师工作台</div>
            <Title level={3} className="section-title">
              <RobotOutlined /> AI 生字词学习包与听写发布
            </Title>
            <Text className="muted">从教材内容到班级听写任务，三步完成参赛演示主流程。</Text>
          </Col>
          <Col xs={24} lg={14}>
            <Steps
              current={teacherStep}
              items={[
                { title: '选择课文', icon: <BookOutlined /> },
                { title: 'AI 生成', icon: <RobotOutlined /> },
                { title: '教师确认', icon: <CheckCircleOutlined /> },
                { title: '发布任务', icon: <SoundOutlined /> }
              ]}
            />
          </Col>
        </Row>
      </Card>
      <Row gutter={[16, 16]}>
        <Col xs={12} lg={6}>
          <div className="metric-tile tile-blue">
            <span>教材样例</span>
            <strong>{lessons.length}</strong>
          </div>
        </Col>
        <Col xs={12} lg={6}>
          <div className="metric-tile tile-green">
            <span>班级</span>
            <strong>{classes.find((item) => item.id === selectedClassId)?.name || classes[0]?.name || '待加载'}</strong>
          </div>
        </Col>
        <Col xs={12} lg={6}>
          <div className="metric-tile tile-amber">
            <span>生成生字</span>
            <strong>{pack?.content.characters.length || 0}</strong>
          </div>
        </Col>
        <Col xs={12} lg={6}>
          <div className="metric-tile tile-rose">
            <span>任务状态</span>
            <strong>{task ? '已发布' : pack ? '待发布' : '未生成'}</strong>
          </div>
        </Col>
      </Row>
      <ClassManager classes={classes} selectedClassId={selectedClassId} onClassChange={onClassChange} onDataChanged={onDataChanged} />
      <Card className="workbench-card" title={<span><ReadOutlined /> 课文导入与学习包生成</span>}>
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={8}>
            <Form
              form={form}
              layout="vertical"
              initialValues={{
                grade: '一年级',
                volume: '下册',
                unit: '第一单元',
                title: '识字练习：天气和心情',
                content: '晴天里，小朋友看着清清的小河，心情很好。请大家认真学习生字和词语。'
              }}
            >
              <Form.Item label="选择教材样例">
                <Select
                  value={selectedLessonId}
                  onChange={setSelectedLessonId}
                  options={lessons.map((item) => ({ label: `${item.grade}${item.volume} · ${item.title}`, value: item.id }))}
                />
              </Form.Item>
              <Form.Item name="grade" label="年级" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item name="volume" label="册次" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item name="unit" label="单元" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item name="title" label="课文/学习包标题" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item name="content" label="课文或教师输入内容">
                <Input.TextArea rows={5} />
              </Form.Item>
              <Form.Item label="教材图片 / 词语清单">
                <Row gutter={[10, 10]}>
                  <Col span={12}>
                    <button
                      className={`upload-card-button compact-upload ${loading ? 'disabled' : ''}`}
                      type="button"
                      onClick={() => materialImageInputRef.current?.click()}
                      disabled={loading}
                    >
                      <CloudUploadOutlined />
                      <span>教材截图</span>
                      <small>OCR 提取课文</small>
                    </button>
                    <input ref={materialImageInputRef} className="hidden-file-input" type="file" accept="image/*" onChange={handleMaterialImageChange} disabled={loading} />
                  </Col>
                  <Col span={12}>
                    <button
                      className={`upload-card-button compact-upload ${loading ? 'disabled' : ''}`}
                      type="button"
                      onClick={() => wordListInputRef.current?.click()}
                      disabled={loading}
                    >
                      <FileExcelOutlined />
                      <span>词语清单</span>
                      <small>TXT / CSV</small>
                    </button>
                    <input ref={wordListInputRef} className="hidden-file-input" type="file" accept=".txt,.csv,text/plain,text/csv" onChange={handleWordListImport} disabled={loading} />
                  </Col>
                </Row>
              </Form.Item>
              <Button type="primary" block size="large" icon={<RobotOutlined />} loading={loading} onClick={generatePack}>
                AI 生成生字词学习包
              </Button>
            </Form>
          </Col>
          <Col xs={24} lg={16}>
            {pack ? (
              <Space direction="vertical" size={12} className="full">
                <Alert
                  type={pack.ai_status === 'success' ? 'success' : 'info'}
                  showIcon
                  message={pack.ai_status === 'success' ? '已接入云端 AI 生成' : '当前使用本地演示兜底生成'}
                  description="教师确认后即可发布听写任务。云端部署配置 AI_API_KEY 后会优先调用真实大模型。"
                />
                <Table<CharacterItem>
                  rowKey={(record) => `${record.char}-${record.display_pinyin}`}
                  dataSource={pack.content.characters}
                  columns={columns}
                  pagination={false}
                  size="middle"
                  scroll={{ x: 1080 }}
                />
                <Space wrap>
                  <Button icon={<PlusOutlined />} onClick={() => openCharEditor(null)}>
                    新增生字
                  </Button>
                  <Button icon={<PlusOutlined />} onClick={() => openDictationEditor(null)}>
                    新增听写题
                  </Button>
                  {task && (
                    <>
                      <Tag color="blue">已发布：{task.title}</Tag>
                      <Button icon={<BarChartOutlined />} onClick={() => loadReport(task.id)}>查看班级报告</Button>
                      <Button icon={<FileExcelOutlined />} onClick={() => downloadCsv(`/reports/tasks/${task.id}/export`, `${task.title}.csv`)}>导出 Excel 兼容 CSV</Button>
                      <Button icon={<FileExcelOutlined />} onClick={() => downloadCsv(`/reports/tasks/${task.id}/export.xlsx`, `${task.title}.xlsx`)}>导出 Excel</Button>
                    </>
                  )}
                </Space>
                <div className="inner-panel">
                  <div className="inner-title">听写清单</div>
                  <Table<DictationPackItem>
                    rowKey={(record, index) => `${record.answer}-${index}`}
                    dataSource={pack.content.dictation_items}
                    columns={dictationColumns}
                    pagination={false}
                    size="small"
                    scroll={{ x: 820 }}
                  />
                </div>
                <div className="task-config-panel">
                  <div className="inner-title">
                    <ScheduleOutlined /> 听写任务配置
                  </div>
                  <Form form={taskForm} layout="vertical">
                    <Row gutter={[12, 0]}>
                      <Col xs={24} md={12}>
                        <Form.Item name="title" label="任务名称" rules={[{ required: true }]}>
                          <Input />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={12}>
                        <Form.Item name="class_id" label="发布班级" rules={[{ required: true }]}>
                          <Select
                            onChange={(value) => onClassChange(value).catch((error) => message.error(error.message))}
                            options={classes.map((item) => ({ value: item.id, label: `${item.name} · ${item.grade}` }))}
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={12}>
                        <Form.Item name="question_type" label="题型" rules={[{ required: true }]}>
                          <Select
                            options={[
                              { value: 'word', label: '字词听写' },
                              { value: 'char', label: '单字听写' },
                              { value: 'pinyin', label: '拼音听写' },
                              { value: 'pinyin_to_word', label: '看拼音写词语' },
                              { value: 'choice', label: '听音选字' }
                            ]}
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={12} md={8}>
                        <Form.Item name="interval_seconds" label="播放间隔" rules={[{ required: true }]}>
                          <InputNumber min={3} max={30} addonAfter="秒" className="full" />
                        </Form.Item>
                      </Col>
                      <Col xs={12} md={8}>
                        <Form.Item name="repeat" label="重复次数" rules={[{ required: true }]}>
                          <InputNumber min={1} max={3} addonAfter="遍" className="full" />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={8}>
                        <Form.Item name="deadline" label="截止时间">
                          <Input type="datetime-local" />
                        </Form.Item>
                      </Col>
                      <Col span={24}>
                        <Form.Item name="selected_answers" label="听写范围" rules={[{ required: true }]}>
                          <Checkbox.Group
                            className="dictation-scope"
                            options={pack.content.dictation_items.map((item) => ({
                              label: item.answer,
                              value: item.answer
                            }))}
                          />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Button type="primary" size="large" icon={<SoundOutlined />} loading={loading} onClick={confirmAndPublish}>
                      确认学习包并发布听写
                    </Button>
                  </Form>
                </div>
              </Space>
            ) : (
              <Empty description="先生成一份生字词学习包" />
            )}
          </Col>
        </Row>
      </Card>
      {report && <ReportView report={report} />}
      <Modal
        title={editingCharIndex === null ? '新增生字学习卡片' : '编辑生字学习卡片'}
        open={charEditorOpen}
        onCancel={() => setCharEditorOpen(false)}
        onOk={saveChar}
        confirmLoading={loading}
        okText="保存"
      >
        <Form form={charForm} layout="vertical">
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="char" label="生字" rules={[{ required: true }]}>
                <Input maxLength={2} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="display_pinyin" label="拼音标注" rules={[{ required: true }]}>
                <Input placeholder="qíng" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="pinyin" label="拼音编码">
                <Input placeholder="qing2" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="radical" label="部首" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="structure" label="结构" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="stroke_count" label="笔画数">
                <InputNumber min={1} max={40} className="full" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="words_text" label="组词" rules={[{ required: true }]}>
            <Input placeholder="晴天、晴朗、放晴" />
          </Form.Item>
          <Form.Item name="stroke_order_text" label="笔顺提示">
            <Input placeholder="竖、横折、横、横" />
          </Form.Item>
          <Form.Item name="simple_sentence" label="例句">
            <Input />
          </Form.Item>
          <Form.Item name="mistakes_text" label="易错提醒">
            <Input.TextArea rows={3} placeholder="每行一条" />
          </Form.Item>
          <Form.Item name="confusing_text" label="形近字/同音字辨析">
            <Input.TextArea rows={3} placeholder="睛：睛是目字旁，和眼睛有关" />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title={editingDictationIndex === null ? '新增听写题' : '编辑听写题'}
        open={dictationEditorOpen}
        onCancel={() => setDictationEditorOpen(false)}
        onOk={saveDictationItem}
        confirmLoading={loading}
        okText="保存"
      >
        <Form form={dictationForm} layout="vertical">
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="type" label="题型" rules={[{ required: true }]}>
                <Select
                  options={[
                    { value: 'word', label: '字词' },
                    { value: 'char', label: '单字' },
                    { value: 'pinyin', label: '拼音' },
                    { value: 'pinyin_to_word', label: '看拼音写词语' },
                    { value: 'choice', label: '听音选字' }
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="difficulty" label="难度">
                <InputNumber min={1} max={5} className="full" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="answer" label="标准答案" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="char" label="关联生字">
            <Input maxLength={2} />
          </Form.Item>
          <Form.Item name="prompt_text" label="题目提示">
            <Input />
          </Form.Item>
          <Form.Item name="audio_text" label="朗读文本">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
      <LearningCardModal item={learningCardItem} onClose={() => setLearningCardItem(null)} />
    </Space>
  );
}

function LearningCardModal({ item, onClose }: { item: CharacterItem | null; onClose: () => void }) {
  return (
    <Modal title="生字学习卡片" open={Boolean(item)} onCancel={onClose} footer={null} width={720}>
      {item && (
        <Space direction="vertical" size={14} className="full learning-card">
          <div className="learning-card-hero">
            <HanziGridWord value={item.char} size="large" />
            <div>
              <Title level={3}>{item.display_pinyin || item.pinyin}</Title>
              <Text className="muted">
                部首：{item.radical} · 结构：{item.structure} · 笔画：{item.stroke_count || '待确认'}
              </Text>
              <div className="learning-card-actions">
                <Button icon={<SoundOutlined />} onClick={() => speakChinese(`${item.char}，${item.words?.[0] || ''}`)}>
                  朗读
                </Button>
                <Button onClick={() => speakChinese(item.simple_sentence || item.char)}>读例句</Button>
              </div>
            </div>
          </div>
          <Row gutter={[12, 12]}>
            <Col xs={24} md={12}>
              <div className="learning-card-section">
                <Text strong>组词</Text>
                <div>{item.words?.map((word) => <Tag key={word}>{word}</Tag>)}</div>
              </div>
            </Col>
            <Col xs={24} md={12}>
              <div className="learning-card-section">
                <Text strong>例句</Text>
                <p>{item.simple_sentence || '教师可补充低年级适用例句。'}</p>
              </div>
            </Col>
            <Col xs={24} md={12}>
              <div className="learning-card-section">
                <Text strong>笔顺提示</Text>
                <div className="stroke-order">
                  {(item.stroke_order?.length ? item.stroke_order : ['请教师补充笔顺']).map((stroke, index) => (
                    <span key={`${stroke}-${index}`}>
                      <b>{index + 1}</b>
                      {stroke}
                    </span>
                  ))}
                </div>
              </div>
            </Col>
            <Col xs={24} md={12}>
              <div className="learning-card-section radical-focus">
                <Text strong>偏旁结构</Text>
                <p>
                  <span>{item.radical}</span>
                  {item.structure}，观察偏旁位置，再看右边或下方部件。
                </p>
              </div>
            </Col>
            <Col xs={24} md={12}>
              <div className="learning-card-section">
                <Text strong>易错提醒</Text>
                <List size="small" dataSource={item.common_mistakes || []} renderItem={(line) => <List.Item>{line}</List.Item>} />
              </div>
            </Col>
            <Col xs={24} md={12}>
              <div className="learning-card-section">
                <Text strong>形近字/同音字</Text>
                <List
                  size="small"
                  dataSource={item.confusing_chars || []}
                  locale={{ emptyText: '暂无易混淆字' }}
                  renderItem={(line) => (
                    <List.Item>
                      <Space>
                        <HanziGridWord value={line.char} />
                        <Text>{line.reason}</Text>
                      </Space>
                    </List.Item>
                  )}
                />
              </div>
            </Col>
          </Row>
        </Space>
      )}
    </Modal>
  );
}

function ClassManager({
  classes,
  selectedClassId,
  onClassChange,
  onDataChanged
}: {
  classes: ClassRoom[];
  selectedClassId?: string;
  onClassChange: (classId: string) => Promise<void>;
  onDataChanged: (preferredClassId?: string) => Promise<void>;
}) {
  const [classForm] = Form.useForm();
  const [studentForm] = Form.useForm();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(false);
  const classId = selectedClassId || classes[0]?.id;

  useEffect(() => {
    if (!selectedClassId && classes[0]) {
      onClassChange(classes[0].id).catch((error) => message.error(error.message));
    }
  }, [classes, onClassChange, selectedClassId]);

  const loadStudents = async (targetClassId = classId) => {
    if (!targetClassId) return;
    const rows = await apiRequest<Student[]>(`/classes/${targetClassId}/students`);
    setStudents(rows);
  };

  useEffect(() => {
    loadStudents().catch((error) => message.error(error.message));
  }, [classId]);

  const createClass = async () => {
    const values = await classForm.validateFields();
    setLoading(true);
    try {
      const created = await apiRequest<ClassRoom>('/classes', {
        method: 'POST',
        body: JSON.stringify({ ...values, teacher_id: DEFAULT_TEACHER_ID })
      });
      message.success('班级已创建');
      classForm.resetFields();
      await onClassChange(created.id);
      await onDataChanged(created.id);
      await loadStudents(created.id);
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const importStudents = async () => {
    if (!classId) return;
    const values = await studentForm.validateFields();
    const names = splitLines(values.names);
    if (!names.length) {
      message.warning('请输入学生姓名');
      return;
    }
    setLoading(true);
    try {
      const result = await apiRequest<{ imported_count: number; students: Student[] }>(`/classes/${classId}/students/import`, {
        method: 'POST',
        body: JSON.stringify({ names })
      });
      setStudents(result.students);
      studentForm.resetFields();
      await onDataChanged(classId);
      message.success(`已导入 ${result.imported_count} 名学生`);
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="workbench-card" title={<span><UserOutlined /> 班级与学生管理</span>}>
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={8}>
          <Form form={classForm} layout="vertical" initialValues={{ grade: '一年级', name: '一年级 2 班' }}>
            <Row gutter={8}>
              <Col span={12}>
                <Form.Item name="name" label="班级名称" rules={[{ required: true }]}>
                  <Input />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="grade" label="年级" rules={[{ required: true }]}>
                  <Input />
                </Form.Item>
              </Col>
            </Row>
            <Button icon={<PlusOutlined />} onClick={createClass} loading={loading}>
              创建班级
            </Button>
          </Form>
        </Col>
        <Col xs={24} lg={8}>
          <Space direction="vertical" className="full">
            <Text strong>选择班级</Text>
              <Select
                value={classId}
                onChange={(value) => {
                  onClassChange(value).catch((error) => message.error(error.message));
                  loadStudents(value).catch((error) => message.error(error.message));
                }}
                options={classes.map((item) => ({ value: item.id, label: `${item.name} · ${item.grade}` }))}
              />
            <Form form={studentForm} layout="vertical">
              <Form.Item name="names" label="导入学生名单" rules={[{ required: true }]}>
                <Input.TextArea rows={3} placeholder="每行一个姓名，也可用顿号/逗号分隔" />
              </Form.Item>
              <Button type="primary" icon={<CloudUploadOutlined />} onClick={importStudents} loading={loading} disabled={!classId}>
                批量导入学生
              </Button>
            </Form>
          </Space>
        </Col>
        <Col xs={24} lg={8}>
          <div className="inner-panel compact-panel">
            <div className="inner-title">当前班级学生</div>
            <List
              size="small"
              dataSource={students}
              locale={{ emptyText: '暂无学生' }}
              renderItem={(item, index) => (
                <List.Item>
                  <Text>{index + 1}. {item.name}</Text>
                </List.Item>
              )}
            />
          </div>
        </Col>
      </Row>
    </Card>
  );
}

function StudentPractice({ students, taskHint }: { students: Student[]; taskHint?: DictationTask | null }) {
  const [studentId, setStudentId] = useState<string | undefined>(students[0]?.id);
  const [tasks, setTasks] = useState<DictationTask[]>([]);
  const [activeTask, setActiveTask] = useState<DictationTask | null>(null);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [autoPlaying, setAutoPlaying] = useState(false);
  const [playbackDone, setPlaybackDone] = useState(false);
  const [intervalSeconds, setIntervalSeconds] = useState(8);
  const [repeatTimes, setRepeatTimes] = useState(1);
  const [countdown, setCountdown] = useState(0);
  const [sheetResult, setSheetResult] = useState<AnswerSheetResult | null>(null);
  const [typedAnswer, setTypedAnswer] = useState('');
  const [manualAnswerResult, setManualAnswerResult] = useState<AnswerResult | null>(null);
  const [mistakes, setMistakes] = useState<MistakeRecord[]>([]);
  const [reviewExercises, setReviewExercises] = useState<Array<Record<string, unknown>>>([]);
  const [pronunciationIndex, setPronunciationIndex] = useState(0);
  const [pronunciationResult, setPronunciationResult] = useState<PronunciationEvaluation | null>(null);
  const [recording, setRecording] = useState(false);
  const [loading, setLoading] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (students[0] && !studentId) {
      setStudentId(students[0].id);
    }
  }, [students, studentId]);

  const selectedStudent = students.find((item) => item.id === studentId);

  const loadStudentData = async (id = studentId) => {
    if (!id) return;
    setLoading(true);
    try {
      const [taskRows, mistakeRows] = await Promise.all([
        apiRequest<DictationTask[]>(`/student/tasks?student_id=${id}`),
        apiRequest<MistakeRecord[]>(`/student/mistakes?student_id=${id}`)
      ]);
      setTasks(taskRows);
      setMistakes(mistakeRows);
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStudentData().catch((error) => message.error(error.message));
  }, [studentId, taskHint?.id]);

  const openTask = async (taskId: string) => {
    if (!studentId) return;
    setLoading(true);
    try {
      const data = await apiRequest<DictationTask>(`/student/tasks/${taskId}?student_id=${studentId}`);
      const created = await apiRequest<Submission>(`/student/tasks/${taskId}/submissions`, {
        method: 'POST',
        body: JSON.stringify({ student_id: studentId })
      });
      setActiveTask(data);
      setSubmission(created);
      setCurrentIndex(0);
      setPronunciationIndex(0);
      setSheetResult(null);
      setTypedAnswer('');
      setManualAnswerResult(null);
      setPronunciationResult(null);
      setPlaybackDone(false);
      setAutoPlaying(false);
      setIntervalSeconds(Number(data.settings?.interval_seconds || 8));
      setRepeatTimes(Number(data.settings?.repeat || 1));
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const speak = (text?: string) => {
    speakChinese(text);
  };

  const currentItem = activeTask?.items[currentIndex];
  const pronunciationItem = activeTask?.items[pronunciationIndex];
  const currentQuestionType = String(activeTask?.settings?.question_type || currentItem?.item_type || 'word');

  useEffect(() => {
    setTypedAnswer('');
    setManualAnswerResult(null);
  }, [currentItem?.id]);

  useEffect(() => {
    if (!autoPlaying || !activeTask || activeTask.items.length === 0) return;
    const item = activeTask.items[currentIndex];
    speak(Array.from({ length: repeatTimes }, () => item.audio_text || item.prompt_text).join('。'));
    setCountdown(intervalSeconds);
    const tick = window.setInterval(() => {
      setCountdown((value) => Math.max(value - 1, 0));
    }, 1000);
    const timer = window.setTimeout(() => {
      window.clearInterval(tick);
      if (currentIndex < activeTask.items.length - 1) {
        setCurrentIndex((value) => value + 1);
      } else {
        setAutoPlaying(false);
        setPlaybackDone(true);
        message.success('听写播放完成，请上传答题照片');
      }
    }, intervalSeconds * 1000);
    return () => {
      window.clearInterval(tick);
      window.clearTimeout(timer);
    };
  }, [autoPlaying, currentIndex, activeTask, intervalSeconds, repeatTimes]);

  const startAutoDictation = () => {
    if (!activeTask) return;
      setCurrentIndex(0);
      setSheetResult(null);
      setTypedAnswer('');
      setManualAnswerResult(null);
      setPlaybackDone(false);
    setAutoPlaying(true);
  };

  const stopAutoDictation = () => {
    setAutoPlaying(false);
    window.speechSynthesis?.cancel();
  };

  const uploadAnswerSheet = async (file: File) => {
    if (!submission) return;
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const result = await apiRequest<AnswerSheetResult>(`/submissions/${submission.id}/answers/image-sheet`, {
        method: 'POST',
        body: formData
      });
      setSheetResult(result);
      setSubmission(result.submission);
      await loadStudentData();
      message.success('答题照片已识别并完成判题');
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const submitTypedAnswer = async () => {
    if (!submission || !currentItem || !typedAnswer.trim()) {
      message.warning('请先输入答案');
      return;
    }
    setLoading(true);
    try {
      const answer = await apiRequest<AnswerResult>(`/submissions/${submission.id}/answers`, {
        method: 'POST',
        body: JSON.stringify({ item_id: currentItem.id, raw_answer: typedAnswer, confidence: 1 })
      });
      const refreshed = await apiRequest<Submission>(`/submissions/${submission.id}/result`);
      setManualAnswerResult(answer);
      setSubmission(refreshed);
      setSheetResult(null);
      await loadStudentData();
      message.success(answer.result === 'correct' ? '文本答案正确' : '已记录本题反馈');
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const submitChoiceAnswer = async (choice: string) => {
    setTypedAnswer(choice);
    if (!submission || !currentItem) return;
    setLoading(true);
    try {
      const answer = await apiRequest<AnswerResult>(`/submissions/${submission.id}/answers`, {
        method: 'POST',
        body: JSON.stringify({ item_id: currentItem.id, raw_answer: choice, confidence: 1 })
      });
      const refreshed = await apiRequest<Submission>(`/submissions/${submission.id}/result`);
      setManualAnswerResult(answer);
      setSubmission(refreshed);
      setSheetResult(null);
      await loadStudentData();
      message.success(answer.result === 'correct' ? '选择正确' : '已记录本题反馈');
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleAnswerSheetChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      uploadAnswerSheet(file).catch((error) => message.error(error.message));
    }
    event.target.value = '';
  };

  const finish = async () => {
    if (!submission) return;
    setLoading(true);
    try {
      const result = await apiRequest<Submission>(`/submissions/${submission.id}/finish`, {
        method: 'POST'
      });
      setSubmission(result);
      await loadStudentData();
      message.success('听写已提交');
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const submitPronunciation = async (blob: Blob, item: DictationTask['items'][number]) => {
    if (!studentId) return;
    setLoading(true);
    try {
      const formData = new FormData();
      const audioFile = new File([blob], `${item.answer}.webm`, { type: blob.type || 'audio/webm' });
      formData.append('student_id', studentId);
      formData.append('target_text', item.answer);
      formData.append('item_id', item.id);
      formData.append('audio', audioFile);
      const result = await apiRequest<PronunciationEvaluation>('/pronunciation/evaluate', {
        method: 'POST',
        body: formData
      });
      setPronunciationResult(result);
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const startRecording = async () => {
    if (!pronunciationItem) return;
    if (!navigator.mediaDevices || typeof MediaRecorder === 'undefined') {
      message.error('当前浏览器不支持录音');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        audioStreamRef.current?.getTracks().forEach((track) => track.stop());
        audioStreamRef.current = null;
        submitPronunciation(blob, pronunciationItem).catch((error) => message.error(error.message));
      };
      recorder.start();
      setRecording(true);
      setPronunciationResult(null);
    } catch (error) {
      message.error((error as Error).message);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setRecording(false);
  };

  const loadReview = async (mistake: MistakeRecord) => {
    if (!studentId) return;
    try {
      const response = await apiRequest<{ exercises: Array<Record<string, unknown>> }>(`/student/mistakes/${mistake.id}/review`, {
        method: 'POST',
        body: JSON.stringify({ student_id: studentId })
      });
      setReviewExercises(response.exercises);
    } catch (error) {
      message.error((error as Error).message);
    }
  };

  const updateMistakeStatus = async (mistake: MistakeRecord, status: 'corrected' | 'reviewing' | 'passed') => {
    if (!studentId) return;
    setLoading(true);
    try {
      await apiRequest<MistakeRecord>(`/student/mistakes/${mistake.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ student_id: studentId, status })
      });
      await loadStudentData();
      message.success(`错题已更新为：${mistakeStatusLabel(status)}`);
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const accuracy = submission?.total_count ? Math.round((submission.correct_count / submission.total_count) * 100) : 0;
  const recognizedRows = sheetResult?.answers || submission?.answers || [];

  return (
    <Space direction="vertical" size={18} className="full">
      <Card className="student-command-card">
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} lg={11}>
            <div className="section-kicker">学生练习台</div>
            <Title level={3} className="section-title">
              <SoundOutlined /> 自动听写、拍照判题、发音练习
            </Title>
            <Text className="muted">大按钮、短路径、即时反馈，适合课堂投屏和家庭复习演示。</Text>
          </Col>
          <Col xs={24} lg={13}>
            <Row gutter={[12, 12]}>
              <Col span={8}>
                <div className="mini-stat">
                  <span>当前学生</span>
                  <strong>{selectedStudent?.name || '待选择'}</strong>
                </div>
              </Col>
              <Col span={8}>
                <div className="mini-stat">
                  <span>可练任务</span>
                  <strong>{tasks.length}</strong>
                </div>
              </Col>
              <Col span={8}>
                <div className="mini-stat">
                  <span>错题数</span>
                  <strong>{mistakes.length}</strong>
                </div>
              </Col>
            </Row>
          </Col>
        </Row>
      </Card>
      <Card className="student-shell-card" title={<span><CameraOutlined /> AI 自动听写与照片判题</span>}>
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={7}>
            <Space direction="vertical" className="full task-rail">
              <Text strong>选择演示学生</Text>
              <Select
                value={studentId}
                onChange={(value) => {
                  setStudentId(value);
                  setActiveTask(null);
                  setSubmission(null);
                  setSheetResult(null);
                  setPronunciationResult(null);
                }}
                options={students.map((item) => ({ value: item.id, label: item.name }))}
              />
              <Button icon={<UserOutlined />} onClick={() => loadStudentData()} loading={loading}>
                刷新任务
              </Button>
              <Divider />
              <List
                size="small"
                header="已发布听写任务"
                dataSource={tasks}
                locale={{ emptyText: '教师发布任务后会出现在这里' }}
                renderItem={(item) => (
                  <List.Item
                    actions={[
                      <Button type="link" key="start" onClick={() => openTask(item.id)}>
                        进入
                      </Button>
                    ]}
                  >
                    <List.Item.Meta title={item.title} description={item.submission ? `已练：${item.submission.correct_count}/${item.submission.total_count}` : '待完成'} />
                  </List.Item>
                )}
              />
            </Space>
          </Col>
          <Col xs={24} lg={10}>
            {activeTask && currentItem ? (
              <Card className="practice-card dictation-stage">
                <Space direction="vertical" size={14} className="full">
                  <Space>
                    <Tag color="blue">
                      第 {currentIndex + 1} / {activeTask.items.length} 题
                    </Tag>
                    <Tag>{activeTask.title}</Tag>
                    <Tag>{questionTypeLabel(currentQuestionType)}</Tag>
                    <Tag>重复 {repeatTimes} 遍</Tag>
                    {autoPlaying && <Tag color="green">自动播放中</Tag>}
                  </Space>
                  <div className="dictation-card">
                    <div className="dictation-index">第 {currentIndex + 1} 题</div>
                    <div className="dictation-main">
                      {currentQuestionType === 'pinyin_to_word'
                        ? currentItem.answer_meta?.display_pinyin || currentItem.prompt_text.replace('看拼音写词语：', '')
                        : currentQuestionType === 'choice'
                          ? '听音选字'
                          : autoPlaying
                            ? '正在朗读'
                            : playbackDone
                              ? '播放完成'
                              : '准备听写'}
                    </div>
                    <Text className="muted">
                      {currentQuestionType === 'pinyin_to_word'
                        ? '看拼音，在输入框中写出对应词语。'
                        : currentQuestionType === 'choice'
                          ? '听 AI 朗读后，从下方选项中选择正确的字。'
                          : '听 AI 朗读，在纸上写下词语；页面不会直接显示答案。'}
                    </Text>
                    {autoPlaying && <div className="countdown-pill">{countdown} 秒后下一词</div>}
                  </div>
                  <Space wrap>
                    <Select
                      value={intervalSeconds}
                      onChange={setIntervalSeconds}
                      options={[
                        { value: 5, label: '5 秒间隔' },
                        { value: 8, label: '8 秒间隔' },
                        { value: 10, label: '10 秒间隔' },
                        { value: 12, label: '12 秒间隔' }
                      ]}
                    />
                    <Select
                      value={repeatTimes}
                      onChange={setRepeatTimes}
                      options={[
                        { value: 1, label: '读 1 遍' },
                        { value: 2, label: '读 2 遍' },
                        { value: 3, label: '读 3 遍' }
                      ]}
                    />
                    <Button icon={<SoundOutlined />} onClick={() => speak(currentItem.audio_text || currentItem.prompt_text)}>播放当前词</Button>
                    <Button icon={<PlayCircleOutlined />} type="primary" disabled={autoPlaying} onClick={startAutoDictation}>
                      开始自动听写
                    </Button>
                    <Button disabled={!autoPlaying} onClick={stopAutoDictation}>
                      暂停
                    </Button>
                  </Space>
                  <Progress percent={Math.round(((currentIndex + 1) / activeTask.items.length) * 100)} status={autoPlaying ? 'active' : playbackDone ? 'success' : 'normal'} />
                  {autoPlaying && <Text>距离下一词约 {countdown} 秒</Text>}
                  <Divider />
                  <Space direction="vertical" className="full">
                    <Text strong>也可以直接输入本题答案，适合家庭练习或投屏演示</Text>
                    {currentQuestionType === 'choice' && (
                      <div className="choice-options">
                        {(currentItem.answer_meta?.options || []).map((option) => (
                          <Button key={option} size="large" onClick={() => submitChoiceAnswer(option)} disabled={!submission || loading}>
                            <HanziGridWord value={option} />
                          </Button>
                        ))}
                      </div>
                    )}
                    <Space.Compact className="full">
                      <Input
                        value={typedAnswer}
                        onChange={(event) => setTypedAnswer(event.target.value)}
                        onPressEnter={submitTypedAnswer}
                        placeholder={
                          currentQuestionType === 'pinyin'
                            ? '输入拼音答案'
                            : currentQuestionType === 'choice'
                              ? '也可直接输入选中的字'
                              : '输入书写答案'
                        }
                        disabled={!submission || loading}
                      />
                      <Button type="primary" onClick={submitTypedAnswer} loading={loading} disabled={!submission}>
                        判题
                      </Button>
                    </Space.Compact>
                    {manualAnswerResult && (
                      <Alert
                        type={manualAnswerResult.result === 'correct' ? 'success' : manualAnswerResult.result === 'pending_review' ? 'warning' : 'error'}
                        showIcon
                        message={answerResultLabel(manualAnswerResult.result)}
                        description={manualAnswerResult.feedback?.tips?.join('；') || manualAnswerResult.feedback?.message}
                      />
                    )}
                    <Divider />
                    <Text strong>上传答题照片后，系统会按题目顺序自动识别并判题</Text>
                    <label className={`upload-drop ${!submission || loading ? 'disabled' : ''}`}>
                      <CloudUploadOutlined />
                      <span>上传整张答题照片</span>
                      <small>演示时文件名包含 wrong 会模拟一处形近字错误</small>
                      <Input className="hidden-input" type="file" accept="image/*" onChange={handleAnswerSheetChange} disabled={!submission || loading} />
                    </label>
                    <Space wrap>
                      <Button icon={<CheckCircleOutlined />} onClick={finish} disabled={!submission}>
                        完成听写
                      </Button>
                      {sheetResult && (
                        <Tag color={sheetResult.provider === 'mock' ? 'gold' : 'green'}>
                          {sheetResult.provider} · 置信度 {Math.round(sheetResult.confidence * 100)}%
                        </Tag>
                      )}
                    </Space>
                  </Space>
                  {recognizedRows.length > 0 && (
                    <Table
                      rowKey="id"
                      size="small"
                      pagination={false}
                      dataSource={recognizedRows}
                      columns={[
                        { title: '题号', dataIndex: ['item', 'order_no'], width: 70 },
                        { title: '标准答案', dataIndex: ['item', 'answer'] },
                        { title: '识别答案', dataIndex: 'normalized_answer' },
                        {
                          title: '结果',
                          dataIndex: 'result',
                          render: (value: string) => <Tag color={answerResultColor(value)}>{answerResultLabel(value)}</Tag>
                        },
                        {
                          title: '反馈',
                          dataIndex: 'feedback',
                          render: (value: AnswerResult['feedback']) => value?.tips?.[0] || value?.message
                        }
                      ]}
                    />
                  )}
                </Space>
              </Card>
            ) : (
              <Empty description="选择一个任务开始听写" />
            )}
          </Col>
          <Col xs={24} lg={7}>
            <Card title={`${selectedStudent?.name || '学生'}的结果`} className="side-card result-card">
              {submission ? (
                <Space direction="vertical" className="full">
                  <Progress type="circle" percent={accuracy} size={120} />
                  <Text>
                    正确 {submission.correct_count} / {submission.total_count}，错题 {submission.wrong_count}
                  </Text>
                  <Tag color={submission.status === 'submitted' ? 'green' : 'gold'}>
                    {submission.status === 'submitted' ? '已提交' : '进行中'}
                  </Tag>
                </Space>
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无结果" />
              )}
            </Card>
          </Col>
        </Row>
      </Card>
      <Card className="pronunciation-card" title={<span><AudioOutlined /> 看词语练发音</span>}>
        {activeTask && pronunciationItem ? (
          <Row gutter={[16, 16]}>
            <Col xs={24} lg={8}>
              <Space direction="vertical" className="full">
                <Text strong>选择练读词语</Text>
                <Select
                  value={pronunciationIndex}
                  onChange={(value) => {
                    setPronunciationIndex(value);
                    setPronunciationResult(null);
                  }}
                  options={activeTask.items.map((item, index) => ({ value: index, label: item.answer }))}
                />
                <div className="pronunciation-word">
                  <HanziGridWord value={pronunciationItem.answer} size="large" />
                </div>
                <Text>目标词语：{pronunciationItem.answer}</Text>
                <Space wrap>
                  <Button icon={<SoundOutlined />} onClick={() => speak(pronunciationItem.answer)}>播放标准音</Button>
                  <Button icon={<AudioOutlined />} type={recording ? 'default' : 'primary'} danger={recording} loading={loading} onClick={recording ? stopRecording : startRecording}>
                    {recording ? '结束录音' : '开始录音'}
                  </Button>
                </Space>
              </Space>
            </Col>
            <Col xs={24} lg={16}>
              {pronunciationResult ? (
                <Space direction="vertical" className="full">
                  <Progress percent={pronunciationResult.score} status={pronunciationResult.score >= 85 ? 'success' : 'exception'} />
                  <Space wrap>
                    <Tag color={pronunciationResult.mastery === 'passed' ? 'green' : pronunciationResult.mastery === 'needs_practice' ? 'gold' : 'red'}>
                      {pronunciationResult.mastery === 'passed' ? '已掌握' : pronunciationResult.mastery === 'needs_practice' ? '需要再练' : '薄弱'}
                    </Tag>
                    <Tag>{pronunciationResult.provider}</Tag>
                    <Tag>识别：{pronunciationResult.recognized_text}</Tag>
                    <Tag>标准拼音：{pronunciationResult.expected_pinyin}</Tag>
                  </Space>
                  <Alert
                    type={pronunciationResult.score >= 85 ? 'success' : 'warning'}
                    showIcon
                    message="AI 发音评估"
                    description={
                      <Space direction="vertical">
                        {[...pronunciationResult.issues, ...pronunciationResult.correction].map((line) => (
                          <Text key={line}>{line}</Text>
                        ))}
                      </Space>
                    }
                  />
                </Space>
              ) : (
                <Empty description="录音后查看 AI 发音评分和纠正建议" />
              )}
            </Col>
          </Row>
        ) : (
          <Empty description="先选择一个听写任务，再进行词语发音练习" />
        )}
      </Card>
      <Card className="mistake-card" title={<span><BookOutlined /> 专属生字错题本</span>}>
        <List
          dataSource={mistakes}
          locale={{ emptyText: '暂无错题，完成一次错误作答后会自动归集' }}
          renderItem={(item) => (
            <List.Item
              actions={[
                <Button key="review" onClick={() => loadReview(item)}>
                  生成巩固练习
                </Button>,
                <Button key="corrected" onClick={() => updateMistakeStatus(item, 'corrected')}>
                  标记已订正
                </Button>,
                <Button key="passed" type="primary" onClick={() => updateMistakeStatus(item, 'passed')}>
                  标记已过关
                </Button>
              ]}
            >
              <List.Item.Meta
                title={
                  <Space>
                    <span className="hanzi small">{item.char_or_word}</span>
                    <Tag color="red">错 {item.wrong_count} 次</Tag>
                    <Tag>{mistakeTypeLabel(item.mistake_type)}</Tag>
                  </Space>
                }
                description={
                  <Space direction="vertical" size={2}>
                    <Text>
                      状态：{mistakeStatusLabel(item.status)}；最近出错：{item.last_wrong_at_display || formatBeijingTime(item.last_wrong_at)}；下次复练：
                      {item.next_review_at_display || formatBeijingTime(item.next_review_at)}
                    </Text>
                    <Text className="muted">
                      来源：{item.lesson ? `${item.lesson.unit || ''} ${item.lesson.title || ''}` : '演示任务'}；{item.source_task?.title || '听写任务'}
                    </Text>
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      </Card>
      <Modal title="AI 同类巩固练习" open={reviewExercises.length > 0} onCancel={() => setReviewExercises([])} footer={null}>
        <List
          dataSource={reviewExercises}
          renderItem={(item, index) => (
            <List.Item>
              <List.Item.Meta title={`${index + 1}. ${String(item.prompt || '')}`} description={`参考答案：${String(item.answer || '')}`} />
            </List.Item>
          )}
        />
      </Modal>
    </Space>
  );
}

function ParentPortal({ students }: { students: Student[] }) {
  const [studentId, setStudentId] = useState<string | undefined>(students[0]?.id);
  const [tasks, setTasks] = useState<DictationTask[]>([]);
  const [mistakes, setMistakes] = useState<MistakeRecord[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (students[0] && !studentId) {
      setStudentId(students[0].id);
    }
  }, [students, studentId]);

  const selectedStudent = students.find((item) => item.id === studentId);
  const pendingTasks = tasks.filter((item) => !item.submission || !['submitted', 'reviewed'].includes(item.submission.status));
  const finishedTasks = tasks.length - pendingTasks.length;

  const loadParentData = async (id = studentId) => {
    if (!id) return;
    setLoading(true);
    try {
      const [taskRows, mistakeRows] = await Promise.all([
        apiRequest<DictationTask[]>(`/student/tasks?student_id=${id}`),
        apiRequest<MistakeRecord[]>(`/student/mistakes?student_id=${id}`)
      ]);
      setTasks(taskRows);
      setMistakes(mistakeRows);
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadParentData().catch((error) => message.error(error.message));
  }, [studentId]);

  return (
    <Space direction="vertical" size={16} className="full">
      <Card className="student-command-card" title={<span><UserOutlined /> 家长端陪练看板</span>}>
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} lg={8}>
            <Space direction="vertical" className="full">
              <Text strong>学生</Text>
              <Select
                value={studentId}
                onChange={setStudentId}
                options={students.map((item) => ({ value: item.id, label: item.name }))}
              />
              <Button icon={<UserOutlined />} onClick={() => loadParentData()} loading={loading}>
                刷新
              </Button>
            </Space>
          </Col>
          <Col xs={8} lg={5}>
            <div className="mini-stat">
              <span>待完成</span>
              <strong>{pendingTasks.length}</strong>
            </div>
          </Col>
          <Col xs={8} lg={5}>
            <div className="mini-stat">
              <span>已完成</span>
              <strong>{finishedTasks}</strong>
            </div>
          </Col>
          <Col xs={8} lg={5}>
            <div className="mini-stat">
              <span>错题本</span>
              <strong>{mistakes.length}</strong>
            </div>
          </Col>
        </Row>
      </Card>
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Card className="workbench-card" title={`${selectedStudent?.name || '学生'}的听写任务`}>
            <List
              dataSource={tasks}
              loading={loading}
              locale={{ emptyText: '暂无已发布任务' }}
              renderItem={(item) => {
                const status = item.submission?.status || 'not_started';
                return (
                  <List.Item>
                    <List.Item.Meta
                      title={
                        <Space wrap>
                          <Text strong>{item.title}</Text>
                          <Tag>{questionTypeLabel(String(item.settings?.question_type || 'word'))}</Tag>
                          <Tag color={submissionStatusColor(status)}>{submissionStatusLabel(status)}</Tag>
                        </Space>
                      }
                      description={
                        <Space wrap>
                          <Text>完成：{item.submission ? `${item.submission.correct_count}/${item.submission.total_count}` : '0/0'}</Text>
                          {item.deadline && <Text>截止：{formatBeijingTime(item.deadline)}</Text>}
                        </Space>
                      }
                    />
                  </List.Item>
                );
              }}
            />
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card className="mistake-card" title="近期错题与复练状态">
            <List
              dataSource={mistakes}
              loading={loading}
              locale={{ emptyText: '暂无错题' }}
              renderItem={(item) => (
                <List.Item>
                  <List.Item.Meta
                    title={
                      <Space wrap>
                        <HanziGridWord value={item.char_or_word} />
                        <Tag color="red">错 {item.wrong_count} 次</Tag>
                        <Tag>{mistakeTypeLabel(item.mistake_type)}</Tag>
                      </Space>
                    }
                    description={
                      <Space direction="vertical" size={2}>
                        <Text>状态：{mistakeStatusLabel(item.status)}</Text>
                        <Text className="muted">下次复练：{item.next_review_at_display || formatBeijingTime(item.next_review_at)}</Text>
                      </Space>
                    }
                  />
                </List.Item>
              )}
            />
          </Card>
        </Col>
      </Row>
    </Space>
  );
}

function ReportsPanel({
  classes,
  selectedClassId,
  onClassChange
}: {
  classes: ClassRoom[];
  selectedClassId?: string;
  onClassChange: (classId: string) => Promise<void>;
}) {
  const [tasks, setTasks] = useState<DictationTask[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string>();
  const [report, setReport] = useState<TaskReport | null>(null);
  const [anonymousExport, setAnonymousExport] = useState(false);
  const [loading, setLoading] = useState(false);
  const classId = selectedClassId || classes[0]?.id || DEFAULT_CLASS_ID;

  const loadTasks = async () => {
    const rows = await apiRequest<DictationTask[]>(`/classes/${classId}/dictation-tasks`);
    setTasks(rows);
    setSelectedTaskId((current) => (rows.some((item) => item.id === current) ? current : rows[0]?.id));
    if (!rows.length) setReport(null);
  };

  const loadReport = async (taskId = selectedTaskId) => {
    if (!taskId) return;
    setLoading(true);
    try {
      const data = await apiRequest<TaskReport>(`/reports/tasks/${taskId}`);
      setReport(data);
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setSelectedTaskId(undefined);
    setReport(null);
    loadTasks().catch((error) => message.error(error.message));
  }, [classId]);

  return (
    <Space direction="vertical" size={16} className="full">
      <Card className="command-card" title={<span><BarChartOutlined /> 教师端：班级学情分析</span>}>
        <Space wrap>
          <Select
            className="task-select"
            placeholder="选择班级"
            value={classId}
            onChange={(value) => onClassChange(value).catch((error) => message.error(error.message))}
            options={classes.map((item) => ({ value: item.id, label: `${item.name} · ${item.grade}` }))}
          />
          <Select
            className="task-select"
            placeholder="选择听写任务"
            value={selectedTaskId}
            onChange={(value) => {
              setSelectedTaskId(value);
              loadReport(value).catch((error) => message.error(error.message));
            }}
            options={tasks.map((item) => ({ value: item.id, label: item.title }))}
          />
          <Button icon={<UserOutlined />} onClick={() => loadTasks()}>刷新任务</Button>
          <Button icon={<BarChartOutlined />} type="primary" loading={loading} onClick={() => loadReport()}>
            生成报告
          </Button>
          <Checkbox checked={anonymousExport} onChange={(event) => setAnonymousExport(event.target.checked)}>
            匿名导出
          </Checkbox>
          {selectedTaskId && (
            <Button
              icon={<FileExcelOutlined />}
              onClick={() => downloadCsv(`/reports/tasks/${selectedTaskId}/export?anonymous=${anonymousExport}`, '班级听写报告.csv')}
            >
              导出 Excel 兼容 CSV
            </Button>
          )}
          {selectedTaskId && (
            <Button
              icon={<FileExcelOutlined />}
              onClick={() => downloadCsv(`/reports/tasks/${selectedTaskId}/export.xlsx?anonymous=${anonymousExport}`, '班级听写报告.xlsx')}
            >
              导出 Excel
            </Button>
          )}
          {report && (
            <Button icon={<CameraOutlined />} onClick={() => window.print()}>
              打印/保存图片报告
            </Button>
          )}
        </Space>
      </Card>
      <ReviewQueue classId={classId} taskId={selectedTaskId} onReviewed={() => loadReport(selectedTaskId)} />
      {report ? <ReportView report={report} /> : <Empty description="发布并完成听写后可查看报告" />}
    </Space>
  );
}

function ReviewQueue({ classId, taskId, onReviewed }: { classId: string; taskId?: string; onReviewed: () => void }) {
  const [rows, setRows] = useState<ReviewAnswer[]>([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [loading, setLoading] = useState(false);

  const loadRows = async () => {
    setLoading(true);
    try {
      const query = taskId ? `class_id=${classId}&task_id=${taskId}` : `class_id=${classId}`;
      const data = await apiRequest<ReviewAnswer[]>(`/review/pending-answers?${query}`);
      setRows(data);
      setSelectedRowKeys([]);
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRows().catch((error) => message.error(error.message));
  }, [classId, taskId]);

  const reviewOne = async (answerId: string, result: 'correct' | 'wrong') => {
    setLoading(true);
    try {
      await apiRequest(`/review/answers/${answerId}`, {
        method: 'POST',
        body: JSON.stringify({ result, teacher_id: DEFAULT_TEACHER_ID })
      });
      message.success(result === 'correct' ? '已确认为正确' : '已确认为错误');
      await loadRows();
      onReviewed();
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const batchReview = async (result: 'correct' | 'wrong') => {
    if (!selectedRowKeys.length) {
      message.warning('请先选择待复核记录');
      return;
    }
    setLoading(true);
    try {
      await apiRequest('/review/answers/batch', {
        method: 'POST',
        body: JSON.stringify({ answer_ids: selectedRowKeys, result, teacher_id: DEFAULT_TEACHER_ID })
      });
      message.success(`已批量复核 ${selectedRowKeys.length} 条`);
      await loadRows();
      onReviewed();
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    { title: '学生', dataIndex: ['student', 'name'], width: 100 },
    { title: '任务', dataIndex: ['task', 'title'], width: 180 },
    { title: '题号', dataIndex: ['item', 'order_no'], width: 70 },
    { title: '标准答案', dataIndex: ['item', 'answer'], render: (value: string) => <HanziGridWord value={value} /> },
    { title: '识别结果', dataIndex: 'normalized_answer' },
    { title: '置信度', dataIndex: 'confidence', width: 90, render: (value?: number) => `${Math.round((value || 0) * 100)}%` },
    { title: '状态', dataIndex: 'result', width: 100, render: (value: string) => <Tag color={answerResultColor(value)}>{answerResultLabel(value)}</Tag> },
    {
      title: '复核',
      width: 180,
      render: (_: unknown, record: ReviewAnswer) => (
        <Space size={4}>
          <Button size="small" type="primary" onClick={() => reviewOne(record.id, 'correct')}>
            判为正确
          </Button>
          <Button size="small" danger onClick={() => reviewOne(record.id, 'wrong')}>
            判为错误
          </Button>
        </Space>
      )
    }
  ];

  return (
    <Card className="review-card" title={<span><SaveOutlined /> 教师复核队列</span>}>
      <Space direction="vertical" size={12} className="full">
        <Space wrap>
          <Button onClick={loadRows} loading={loading}>
            刷新待复核
          </Button>
          <Button icon={<CheckCircleOutlined />} disabled={!selectedRowKeys.length} onClick={() => batchReview('correct')}>
            批量确认正确
          </Button>
          <Button danger disabled={!selectedRowKeys.length} onClick={() => batchReview('wrong')}>
            批量确认错误
          </Button>
          <Tag color={rows.length ? 'gold' : 'green'}>待复核 {rows.length} 条</Tag>
        </Space>
        <Table<ReviewAnswer>
          rowKey="id"
          loading={loading}
          size="small"
          dataSource={rows}
          columns={columns}
          pagination={{ pageSize: 5 }}
          rowSelection={{
            selectedRowKeys,
            onChange: setSelectedRowKeys
          }}
          scroll={{ x: 980 }}
        />
      </Space>
    </Card>
  );
}

function AccuracyBar({ value }: { value: number }) {
  return (
    <div className="accuracy-bar">
      <div style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      <span>{value}%</span>
    </div>
  );
}

function HanziGridWord({ value, size = 'small' }: { value: string; size?: 'small' | 'large' }) {
  return (
    <span className={`hanzi-word-grid ${size === 'large' ? 'large' : ''}`} aria-label={value}>
      {Array.from(value).map((char, index) =>
        /[\u4e00-\u9fff]/.test(char) ? (
          <span className={`hanzi tianzi ${size === 'large' ? 'large' : 'small mini'}`} key={`${char}-${index}`}>
            {char}
          </span>
        ) : (
          <span className="hanzi-grid-plain" key={`${char}-${index}`}>
            {char}
          </span>
        )
      )}
    </span>
  );
}

function submissionStatusLabel(value: string) {
  const map: Record<string, string> = {
    submitted: '已提交',
    in_progress: '进行中',
    reviewed: '已复核',
    not_started: '未开始'
  };
  return map[value] || value;
}

function questionTypeLabel(value: string) {
  const map: Record<string, string> = {
    word: '字词听写',
    char: '单字听写',
    pinyin: '拼音听写',
    pinyin_to_word: '看拼音写词语',
    choice: '听音选字'
  };
  return map[value] || value;
}

function answerResultLabel(value: string) {
  const map: Record<string, string> = {
    correct: '正确',
    wrong: '错误',
    suspected: '疑似错误',
    pending_review: '待复核'
  };
  return map[value] || value;
}

function answerResultColor(value: string) {
  const map: Record<string, string> = {
    correct: 'green',
    wrong: 'red',
    suspected: 'orange',
    pending_review: 'gold'
  };
  return map[value] || 'default';
}

function submissionStatusColor(value: string) {
  const map: Record<string, string> = {
    submitted: 'green',
    in_progress: 'blue',
    reviewed: 'cyan',
    not_started: 'default'
  };
  return map[value] || 'default';
}

function ReportView({ report }: { report: TaskReport }) {
  const studentColumns = [
    { title: '学生', dataIndex: 'student_name' },
    { title: '状态', dataIndex: 'status', render: (value: string) => <Tag color={submissionStatusColor(value)}>{submissionStatusLabel(value)}</Tag> },
    { title: '正确数', dataIndex: 'correct_count' },
    { title: '总题数', dataIndex: 'total_count' },
    { title: '正确率', dataIndex: 'accuracy', render: (value: number) => <AccuracyBar value={value} /> },
    {
      title: '薄弱字词',
      dataIndex: 'weak_words',
      render: (value?: TaskReport['students'][number]['weak_words']) =>
        value?.length ? (
          <Space wrap size={4}>
            {value.slice(0, 3).map((item) => (
              <Tag key={item.item}>{item.item} · {item.count}次</Tag>
            ))}
          </Space>
        ) : (
          <Text className="muted">暂无</Text>
        )
    }
  ];
  const unitColumns = [
    { title: '题号', dataIndex: 'order_no', width: 70 },
    { title: '字词', dataIndex: 'item', render: (value: string) => <HanziGridWord value={value} /> },
    { title: '题型', dataIndex: 'question_type', render: (value: string) => questionTypeLabel(value) },
    { title: '已答', dataIndex: 'answered_count' },
    { title: '正确', dataIndex: 'correct_count' },
    { title: '错误', dataIndex: 'wrong_count' },
    { title: '待复核', dataIndex: 'pending_review_count' },
    { title: '掌握率', dataIndex: 'accuracy', render: (value: number) => <AccuracyBar value={value} /> }
  ];
  const maxTypeCount = Math.max(1, ...(report.mistake_types || []).map((item) => item.count));

  return (
    <Card className="report-card" title={<span><BarChartOutlined /> 班级报告：{report.task.title}</span>}>
      <Space direction="vertical" size={16} className="full">
        <Row gutter={[16, 16]}>
          <Col xs={12} md={6}>
            <div className="report-stat">
              <Statistic title="提交人数" value={report.summary.submitted_count} suffix={`/ ${report.summary.total_students}`} />
            </div>
          </Col>
          <Col xs={12} md={6}>
            <div className="report-stat">
              <Statistic title="完成率" value={report.summary.completion_rate} suffix="%" />
            </div>
          </Col>
          <Col xs={12} md={6}>
            <div className="report-stat">
              <Statistic title="平均正确率" value={report.summary.accuracy} suffix="%" />
            </div>
          </Col>
          <Col xs={12} md={6}>
            <div className="report-stat">
              <Statistic title="错题数" value={report.summary.wrong_count} />
            </div>
          </Col>
          <Col xs={12} md={6}>
            <div className="report-stat">
              <Statistic title="待复核" value={report.summary.pending_review_count || 0} />
            </div>
          </Col>
        </Row>
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={8}>
            <RankPanel title="Top 易错字" rows={report.top_chars || []} />
          </Col>
          <Col xs={24} lg={8}>
            <RankPanel title="Top 易错词" rows={report.top_words || report.top_mistakes || []} />
          </Col>
          <Col xs={24} lg={8}>
            <div className="inner-panel">
              <div className="inner-title">AI 复习建议</div>
              <List
                dataSource={report.suggestions}
                renderItem={(item) => (
                  <List.Item>
                    <List.Item.Meta title={`${item.focus} · ${item.duration}`} description={`${item.activity}。原因：${item.reason}`} />
                  </List.Item>
                )}
              />
            </div>
          </Col>
        </Row>
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={8}>
            <div className="inner-panel compact-panel">
              <div className="inner-title">错误类型分布</div>
              <List
                dataSource={report.mistake_types || []}
                locale={{ emptyText: '暂无错误类型' }}
                renderItem={(item) => (
                  <List.Item>
                    <div className="mistake-rank-row">
                      <Tag>{mistakeTypeLabel(item.type)}</Tag>
                      <div className="rank-bar type-bar">
                        <div style={{ width: `${(item.count / maxTypeCount) * 100}%` }} />
                      </div>
                      <Text strong>{item.count}</Text>
                    </div>
                  </List.Item>
                )}
              />
            </div>
          </Col>
          <Col xs={24} lg={8}>
            <RankPanel title="形近字排行榜" rows={report.similar_shape_rank || []} />
          </Col>
          <Col xs={24} lg={8}>
            <RankPanel title="同音字排行榜" rows={report.homophone_rank || []} />
          </Col>
        </Row>
        <div className="inner-panel compact-panel">
          <div className="inner-title">单元字词掌握概览</div>
          <Table
            rowKey="item_id"
            size="small"
            dataSource={report.unit_mastery || []}
            columns={unitColumns}
            pagination={false}
            scroll={{ x: 760 }}
          />
        </div>
        <div className="inner-panel compact-panel">
          <div className="inner-title">学生薄弱字词</div>
          <Row gutter={[12, 12]}>
            {report.students.map((student) => (
              <Col xs={24} md={12} lg={8} key={student.student_id}>
                <div className="weak-student-card">
                  <Text strong>{student.student_name}</Text>
                  <div>
                    {student.weak_words?.length ? (
                      student.weak_words.map((item) => (
                        <Tag key={item.item}>
                          {item.item} · {item.count}次 · {item.types.map(mistakeTypeLabel).join('、')}
                        </Tag>
                      ))
                    ) : (
                      <Text className="muted">暂无明显薄弱字词</Text>
                    )}
                  </div>
                </div>
              </Col>
            ))}
          </Row>
        </div>
        <Table rowKey="student_id" dataSource={report.students} columns={studentColumns} pagination={false} />
      </Space>
    </Card>
  );
}

function RankPanel({ title, rows }: { title: string; rows: Array<{ item: string; count: number }> }) {
  const max = Math.max(1, ...rows.map((item) => item.count));
  return (
    <div className="inner-panel compact-panel">
      <div className="inner-title">{title}</div>
      <List
        dataSource={rows}
        locale={{ emptyText: '暂无数据' }}
        renderItem={(item) => (
          <List.Item>
            <div className="mistake-rank-row">
              <HanziGridWord value={item.item} />
              <div className="rank-bar">
                <div style={{ width: `${(item.count / max) * 100}%` }} />
              </div>
              <Tag color="red">{item.count} 次</Tag>
            </div>
          </List.Item>
        )}
      />
    </div>
  );
}

function mistakeTypeLabel(value: string) {
  const map: Record<string, string> = {
    glyph_error: '字形错误',
    homophone_confusion: '同音字混淆',
    similar_shape_confusion: '形近字混淆',
    radical_confusion: '偏旁混淆',
    unknown: '待分析'
  };
  return map[value] || value;
}

function mistakeStatusLabel(value: string) {
  const map: Record<string, string> = {
    uncorrected: '待订正',
    corrected: '已订正',
    reviewing: '复练中',
    passed: '已过关',
    repeated: '反复错误'
  };
  return map[value] || value;
}

function formatBeijingTime(value?: string | null) {
  if (!value) return '待安排';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
    .format(date)
    .replace(/\//g, '-')}`;
}

function RootApp() {
  const { classes, lessons, students, selectedClassId, loading, reload, changeClass } = useBootstrap();
  const [latestTask, setLatestTask] = useState<DictationTask | null>(null);
  const [activeKey, setActiveKey] = useState('teacher');

  const items = useMemo(
    () => [
      {
        key: 'teacher',
        label: '教师生成与发布',
        children: (
          <TeacherStudio
            classes={classes}
            lessons={lessons}
            selectedClassId={selectedClassId}
            onClassChange={changeClass}
            onDataChanged={reload}
            onTaskCreated={(task) => setLatestTask(task)}
          />
        )
      },
      {
        key: 'student',
        label: '学生 AI 听写',
        children: <StudentPractice students={students} taskHint={latestTask} />
      },
      {
        key: 'parent',
        label: '家长端陪练',
        children: <ParentPortal students={students} />
      },
      {
        key: 'report',
        label: '班级学情报告',
        children: <ReportsPanel classes={classes} selectedClassId={selectedClassId} onClassChange={changeClass} />
      }
    ],
    [changeClass, classes, lessons, students, selectedClassId, latestTask, reload]
  );

  return (
    <Layout className="shell">
      <Header className="header">
        <div>
          <Title level={3} className="header-title">
            <TrophyOutlined /> AI 生字词智能过关小助手
          </Title>
          <Text className="header-subtitle">小学一二年级语文 · 参赛 MVP 演示版</Text>
        </div>
        <Space wrap>
          <Tag color={loading ? 'gold' : 'green'}>{loading ? '初始化中' : '演示数据已就绪'}</Tag>
          <Tag color="blue">课堂听写</Tag>
          <Tag color="cyan">照片判题</Tag>
          <Tag color="purple">发音评估</Tag>
        </Space>
      </Header>
      <Content className="content">
        <div className="top-flow">
          <div>
            <div className="section-kicker">比赛演示路径</div>
            <Text>教师生成任务 → 学生自动听写并上传答题照片 → AI 归集错题 → 教师查看班级报告</Text>
          </div>
          <RobotOutlined className="top-flow-icon" />
        </div>
        <Tabs className="main-tabs" activeKey={activeKey} onChange={setActiveKey} items={items} />
      </Content>
    </Layout>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider locale={zhCN}>
      <AntdApp>
        <RootApp />
      </AntdApp>
    </ConfigProvider>
  </React.StrictMode>
);
