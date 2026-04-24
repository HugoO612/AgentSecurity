import { useNavigate } from 'react-router-dom'
import { PageScaffold } from '../../components/PageScaffold'
import { useEnvironment } from '../../domain/machine'

export function DeleteCompletePage() {
  const navigate = useNavigate()
  const { snapshot } = useEnvironment()
  const deleteSummary = snapshot.deleteSummary

  return (
    <PageScaffold
      titleKey="COPY_TITLE_STATUS"
      descriptionKey="COPY_DESC_FAIL_SAFE"
      sideContent={
        <div className="side-panel">
          <p className="eyebrow">删除结果</p>
          <div className="promise-card">
            <h3>隔离环境已删除</h3>
            <p>{deleteSummary?.windowsHostResidualSummary ?? '已完成删除。'}</p>
          </div>
        </div>
      }
    >
      <div className="stack-lg">
        <article className="content-card">
          <p className="eyebrow">已删除什么</p>
          <ul className="info-list">
            {(deleteSummary?.deletedItems ?? []).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
        <article className="content-card">
          <p className="eyebrow">未删除什么</p>
          <ul className="info-list">
            {(deleteSummary?.remainingItems ?? []).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
        <div className="action-row">
          <button
            type="button"
            className="primary-button"
            onClick={() => navigate('/preinstall')}
          >
            重新开始安装
          </button>
        </div>
      </div>
    </PageScaffold>
  )
}
