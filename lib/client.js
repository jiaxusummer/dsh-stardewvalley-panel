// dsh-stardewvalley-panel 的浏览器半侧：设置 → 星露谷 一整页。
//
// 版式照以前那几个插件（dsh-window-mem / dsh-icon-changer）的设置页来：
// 页头（16/600 标题 + 12/18 说明）+ 几张卡片；卡片里是
//   - 状态字段：13/500 标签 + 13/20 值，上下排列，0.5px 发丝线分隔；
//   - 设置行：14/20 标题 + 12/18 说明在左，控件在右，14px 上下；
//   - 按钮 34px，卡片底色 --dsw-alias-card-fill，控件跟宿主主题。
// 组件里的数据逻辑没变：轮询 /state、POST /config 和各个动作。
// 模块 id 必须等于包名。文件保持 UTF-8（无 BOM）。
window.__ModuleLoader__.load({
	id: "dsh-stardewvalley-panel",
	factory: (require) => {
		var module = { exports: {} };
		const React = require("react");
		const h = React.createElement;
		const PACKAGE = "dsh-stardewvalley-panel";
		const API = "/dsh-stardewvalley-panel";

		const CSS = [
  `.ops{display:flex;flex-direction:column;gap:10px;max-width:780px;box-sizing:border-box;color:var(--dsw-alias-label-primary);font-family:"Microsoft YaHei","微软雅黑","PingFang SC","Segoe UI",sans-serif;font-size:12px;line-height:18px}`,
  `.ops-head{display:flex;flex-direction:column;gap:4px;padding:0 2px 2px}`,
  `.ops-title{margin:0;font-size:15px;font-weight:600;line-height:22px}`,
  `.ops-sub{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);opacity:.88}`,
  `.ops-card{display:flex;flex-direction:column;gap:6px;padding:8px;border-radius:12px;background:var(--dsw-alias-bg-layer-1,var(--dsw-alias-card-fill));border:1px solid var(--dsw-alias-border-l1)}`,
  `.ops-card-head{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:27px}`,
  `.ops-card-title{margin:0;font-size:15px;font-weight:600;line-height:22px}`,
  `.ops-card-head-right{display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end}`,
  `.ops-grid2{display:flex;gap:10px;align-items:stretch}`,   `.ops-tabpanel{display:flex;flex-direction:column;gap:10px}`,
  `.ops-grid2>.ops-card{min-width:0}`,
  `.ops-grid2>.ops-card:first-child{flex:5 1 0}`,
  `.ops-grid2>.ops-card:last-child{flex:5 1 0}`,
  `.ops-fields{display:flex;flex-direction:column;min-width:0}`,
  `.ops-field{display:flex;flex-direction:column;gap:2px;padding:6px 0;min-width:0}`,
  `.ops-field+.ops-field{border-top:1px solid var(--dsw-alias-border-l2)}`,
  `.ops-field:first-child{padding-top:0}`,
  `.ops-field:last-child{padding-bottom:0}`,
  `.ops-field-label{font-size:12px;line-height:18px;font-weight:400;color:var(--dsw-alias-label-secondary);opacity:.88}`,
  `.ops-field-value{font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary);overflow-wrap:anywhere;white-space:pre-wrap}`,
  `.ops-mono{font-family:Consolas,ui-monospace,monospace;font-size:11px}`,
  `.ops-rows{display:flex;flex-direction:column;min-width:0}`,
  `.ops-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid var(--dsw-alias-border-l2)}`,
  `.ops-row:first-child{padding-top:0}`,
  `.ops-row:last-child{padding-bottom:0;border-bottom:none}`,
  `.ops-row-text{flex:1;min-width:0;display:flex;flex-direction:column}`,
  `.ops-row-title{font-size:12px;line-height:18px;font-weight:600;color:var(--dsw-alias-label-primary)}`,
  `.ops-row-desc{margin-top:2px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);opacity:.88}`,
  `.ops-control{flex:none;display:flex;align-items:center;gap:6px;max-width:62%}`,
  `.ops-control .ops-input{min-width:0}`,
  `.ops-pill{display:inline-flex;align-items:center;gap:4px;height:20px;padding:0 6px;border-radius:999px;font-size:11px;line-height:20px;background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-2));color:var(--dsw-alias-label-secondary)}`,
  `.ops-dot{width:5px;height:5px;border-radius:50%;background:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary))}`,
  `.ops-on{color:var(--dsw-alias-state-success-primary)}`,
  `.ops-on .ops-dot{background:var(--dsw-alias-state-success-primary)}`,
  `.ops-warn{color:var(--dsw-alias-state-warn-primary)}`,
  `.ops-warn .ops-dot{background:var(--dsw-alias-state-warn-primary)}`,
  `.ops-btn{display:inline-flex;align-items:center;justify-content:center;min-height:24px;padding:4px 9px;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l4);border-radius:9px;background:transparent;font:inherit;font-size:11px;line-height:1.5;color:var(--dsw-alias-label-primary);cursor:pointer;white-space:nowrap}`,
  `.ops-btn:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}`,
  `.ops-btn:disabled{border-style:dashed;color:var(--dsw-alias-label-secondary);opacity:.65;pointer-events:none;cursor:default}`,
  `.ops-btn.ops-primary{background:transparent;border-color:var(--dsw-alias-border-l4)}`,
  `.ops-btn.ops-danger{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}`,
  `.ops-btn.ops-warn{color:var(--dsw-alias-state-warn-primary);border-color:var(--dsw-alias-state-warn-primary)}`,
  `.ops-btn.ops-ok{color:var(--dsw-alias-state-success-primary);border-color:var(--dsw-alias-state-success-primary)}`,
  `.ops-btn.ops-info{color:var(--dsw-alias-state-business-primary);border-color:var(--dsw-alias-state-business-primary)}`,
  `@media (hover:hover){.ops-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-2))}}`,
  `.ops-input{height:26px;padding:0 6px;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l4);border-radius:9px;background:var(--dsw-alias-bg-base);font:inherit;font-size:11px;color:var(--dsw-alias-label-primary)}`,
  `.ops-input:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}`,
  `.ops-input.ops-text{width:260px;max-width:100%}`,
  `.ops-input.ops-number{width:90px}`,
  `.ops-input.ops-textarea{height:auto;min-height:56px;padding:4px 6px;line-height:18px;width:320px;max-width:100%;resize:vertical;font-family:inherit}`,
  `.ops-input.ops-select{width:220px;max-width:100%}`,
  `.ops-check-hit{display:inline-flex;align-items:center;justify-content:center;flex:none;width:32px;height:32px;margin:-8px 0;cursor:pointer}`,
  `.ops-check{appearance:none;-webkit-appearance:none;flex:none;width:14px;height:14px;margin:0;border:1px solid var(--dsw-alias-border-l4);border-radius:3px;background:var(--dsw-alias-bg-base);position:relative;cursor:pointer;transition:background-color .12s,border-color .12s}`,
  `.ops-check:checked{background:var(--dsw-alias-state-business-primary,var(--dsw-alias-brand-primary));border-color:var(--dsw-alias-state-business-primary,var(--dsw-alias-brand-primary))}`,
  `.ops-check:checked::after{content:"";position:absolute;left:4px;top:1px;width:3px;height:7px;border:solid var(--dsw-alias-label-primary-foreground,#fff);border-width:0 2px 2px 0;transform:rotate(45deg)}`,
  `.ops-check:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}`,
  `.ops-check:disabled{opacity:.5;cursor:default}`,
  `@media (hover:hover){.ops-check:hover:not(:disabled){border-color:var(--dsw-alias-state-business-primary)}}`,
  `.ops-note{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);opacity:.88}`,
  `.ops-notice{margin:0;font-size:12px;line-height:18px;font-weight:600;color:var(--dsw-alias-state-warn-primary)}`,
  `.ops-feedback{margin:0;font-size:12px;line-height:18px;white-space:pre-wrap}`,
  `.ops-feedback.ops-ok{color:var(--dsw-alias-label-secondary);opacity:.88}`,
  `.ops-feedback.ops-err{color:var(--dsw-alias-state-error-primary)}`,
  `.ops-chart{width:100%;height:auto;display:block}`,
  `.ops-legend{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);opacity:.88}`,
  `.ops-key{display:inline-flex;align-items:center;gap:4px}`,
  `.ops-key i{width:8px;height:2px;border-radius:1px;display:inline-block}`,
  `.ops-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap}`,
  `.ops-credit{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);opacity:.88}`,
  `.ops-credit b{font-weight:600;color:var(--dsw-alias-label-secondary)}`,
  `.ops-list{display:flex;flex-direction:column;min-width:0}`,
  `.ops-list-row{display:flex;align-items:baseline;gap:8px;padding:6px 0;border-bottom:1px solid var(--dsw-alias-border-l2);min-width:0}`,
  `.ops-list-row:last-child{border-bottom:none;padding-bottom:0}`,
  `.ops-list-time{flex:none;font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary);opacity:.88;font-variant-numeric:tabular-nums;width:38px}`,
  `.ops-list-name{flex:none;font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary)}`,
  `.ops-list-text{flex:1;min-width:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);opacity:.88;overflow-wrap:anywhere}`,
  `.ops-list-row.ops-fail .ops-list-name{color:var(--dsw-alias-state-error-primary)}`,
  `.ops-inline{display:flex;align-items:center;gap:6px}`,
  `.ops-tabs{display:flex;align-items:center;gap:2px;border-bottom:1px solid var(--dsw-alias-border-l2);margin:0 2px;padding:0}`,
  `.ops-tab{height:28px;padding:0 10px;box-sizing:border-box;border:none;border-bottom:2px solid transparent;margin-bottom:-1px;background:transparent;font:inherit;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);cursor:pointer}`,
  `.ops-tab:hover{color:var(--dsw-alias-label-primary)}`,
  `.ops-tab:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}`,
  `.ops-tab.ops-tab-active{color:var(--dsw-alias-label-primary);border-bottom-color:var(--dsw-alias-state-business-primary,var(--dsw-alias-brand-primary))}`,
  `.ops-statusline{display:flex;flex-wrap:wrap;align-items:baseline;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);opacity:.88;min-width:0}`,
  `.ops-statusline .sep{color:var(--dsw-alias-label-secondary);opacity:.6;margin:0 6px}`,
  `.ops-statusline b{font-weight:600;color:var(--dsw-alias-label-primary);opacity:1}`,
  `.ops-savebar{position:sticky;bottom:0;display:flex;align-items:center;gap:8px;padding:6px 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-overlay,var(--dsw-alias-bg-layer-1));z-index:2}`,
  `.ops-savebar-text{flex:1;min-width:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);opacity:.88}`,
  `.ops-details>summary{cursor:pointer;list-style:none}`,
  `.ops-details>summary::-webkit-details-marker{display:none}`,
  `.ops-details>summary::before{content:"▸ ";color:var(--dsw-alias-label-secondary);opacity:.88}`,
  `.ops-details[open]>summary::before{content:"▾ "}`,
  `.ops-grid-fields{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px 16px;padding-top:8px;border-top:1px solid var(--dsw-alias-border-l2)}`,
  `.ops-grid-fields>.ops-field{padding:0;border-top:none}`,
  `@media (max-width:720px){.ops-grid2{flex-direction:column}.ops-grid2>.ops-card:first-child,.ops-grid2>.ops-card:last-child{flex:1 1 auto}.ops-grid-fields{grid-template-columns:minmax(0,1fr)}}`,
].join("");

		const TOOL_LABELS = {
			load_save: "读档", travel_to: "去别的地图", move_to: "走过去", use_tool: "用工具",
			interact: "交互", water_crops: "浇水", till_area: "开地", plant_seeds: "播种",
			harvest_crops: "收获", clear_area: "清理", fish: "钓鱼", eat: "吃东西", sleep: "睡觉",
			wait: "等时间", buy: "买东西", sell: "卖东西", ship_items: "出货", store_items: "存进箱子",
			take_items: "从箱子拿", tidy_backpack: "整理背包", explore_mine: "下矿", fight: "打怪",
			care_animals: "照顾动物", give_gift: "送礼", festival: "节日", open_shop: "逛店",
			close_menu: "关界面", dialogue: "对话", cook: "做饭", craft: "制作", build: "建造",
			upgrade_tool: "升级工具", buy_animal: "买动物", crack_geodes: "砸晶球",
			donate_bundles: "交收集包", quest_board: "看告示板", check_crab_pots: "收蟹笼",
			get_guide: "读攻略", get_state: "看状态", toggle_ai: "开关 AI",
		};

		function labelOfTool(tool) {
			return TOOL_LABELS[tool] || String(tool || "");
		}

		function shortName(path) {
			const text = String(path || "");
			const index = Math.max(text.lastIndexOf("/"), text.lastIndexOf("\\"));
			return index >= 0 ? text.slice(index + 1) : text;
		}

		function request(path, options) {
			const opts = options || {};
			const headers = {};
			if (opts.method === "POST") headers["x-dsh-stardewvalley-panel"] = "1";
			if (opts.body !== undefined) headers["content-type"] = "application/json";
			return fetch(API + path, {
				method: opts.method || "GET",
				cache: "no-store",
				headers,
				body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
			}).then(function (res) {
				return res.text().then(function (text) {
					let body = null;
					try { body = text ? JSON.parse(text) : null; } catch (e) { body = null; }
					if (!res.ok || (body && body.ok === false)) {
						const error = new Error((body && body.error) || "HTTP " + res.status);
						error.status = res.status;
						throw error;
					}
					return body || {};
				});
			});
		}

		function clockText(iso) {
			try {
				const d = new Date(iso);
				if (Number.isNaN(d.getTime())) return "";
				const pad = function (n) { return n < 10 ? "0" + n : "" + n; };
				return pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
			} catch (e) {
				return "";
			}
		}

		function numberText(value, suffix) {
			if (typeof value !== "number" || !Number.isFinite(value)) return "—";
			return value.toLocaleString("zh-CN") + (suffix || "");
		}

		function ageText(seconds) {
			if (typeof seconds !== "number" || !Number.isFinite(seconds)) return "";
			const s = Math.max(0, Math.round(seconds));
			if (s < 60) return s + " 秒前";
			if (s < 3600) return Math.floor(s / 60) + " 分钟前";
			if (s < 86400) return Math.floor(s / 3600) + " 小时前";
			return Math.floor(s / 86400) + " 天前";
		}

		function Style() {
			return h("style", null, CSS);
		}

		function Pill(props) {
			const tone = props.tone === "on" ? " ops-on" : props.tone === "warn" ? " ops-warn" : "";
			return h("span", { className: "ops-pill" + tone }, h("i", { className: "ops-dot" }), props.children);
		}

		function Button(props) {
			const kind = props.danger ? " ops-danger"
			  : props.warn ? " ops-warn"
			  : props.ok ? " ops-ok"
			  : props.info ? " ops-info"
			  : props.primary ? " ops-primary"
			  : "";
			return h("button", {
				type: "button",
				className: "ops-btn" + kind,
				disabled: props.disabled,
				onClick: props.disabled ? undefined : props.onClick,
			}, props.children);
		}

		/** 状态字段：13/500 标签在上，13/20 值在下，发丝线分隔。 */
		function Field(props) {
			return h("div", { className: "ops-field" },
				h("span", { className: "ops-field-label" }, props.label),
				h("span", { className: "ops-field-value" + (props.mono ? " ops-mono" : "") }, props.value === undefined || props.value === null || props.value === "" ? "—" : props.value),
			);
		}

		/** 设置行：14/20 标题 + 12/18 说明在左，控件在右。 */
		function SettingRow(props) {
			return h("div", { className: "ops-row" },
				h("div", { className: "ops-row-text" },
					h("label", { className: "ops-row-title", htmlFor: props.id }, props.label),
					props.desc ? h("div", { className: "ops-row-desc" }, props.desc) : null,
				),
				h("div", { className: "ops-control" }, props.children),
			);
		}

		function CheckRow(props) {
			const id = "ops-" + props.name;
			return h("div", { className: "ops-row" },
				h("div", { className: "ops-row-text" },
					h("label", { className: "ops-row-title", htmlFor: id }, props.label),
					props.desc ? h("div", { className: "ops-row-desc" }, props.desc) : null,
				),
				h("label", { className: "ops-check-hit" },
					h("input", {
						id: id,
						type: "checkbox",
						className: "ops-check",
						checked: props.checked === true,
						disabled: props.disabled,
						onChange: props.disabled || !props.onChange ? undefined : function (event) { props.onChange(event.target.checked === true); },
					}),
				),
			);
		}

		function MoodChart(props) {
			const allRows = (props.rows || []).filter(function (row) { return row.mood !== null && row.excite !== null; });
			// 只看最近 30 天，再早就翻篇了
			const rows = allRows.slice(-30);
			if (rows.length < 2) {
				return h("p", { className: "ops-note" }, rows.length === 1 ? "目前只有一天记了数，再多一天就能画线。" : "心情表里还没有记数。");
			}
			const W = 640;
			const H = 150;
			const padX = 10;
			const padY = 12;
			const x = function (i) { return padX + (W - padX * 2) * (i / (rows.length - 1)); };
			const y = function (v) { return padY + (H - padY * 2) * (1 - v / 100); };
			const path = function (key) {
				return rows.map(function (row, i) {
					return (i === 0 ? "M" : "L") + x(i).toFixed(1) + "," + y(row[key]).toFixed(1);
				}).join(" ");
			};
			const grid = [0, 25, 50, 75, 100].map(function (v) {
				return h("line", {
					key: "g" + v, x1: padX, x2: W - padX, y1: y(v), y2: y(v),
					stroke: "var(--dsw-alias-border-l2)", strokeWidth: 1,
				});
			});
			const last = rows[rows.length - 1];
			return h(React.Fragment, null,
				h("svg", { className: "ops-chart", viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": "心情和兴奋的每日曲线" },
					grid,
					h("path", { d: path("excite"), fill: "none", stroke: "var(--dsw-alias-state-warn-primary)", strokeWidth: 2, strokeLinejoin: "round", strokeLinecap: "round" }),
					h("path", { d: path("mood"), fill: "none", stroke: "var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary))", strokeWidth: 2, strokeLinejoin: "round", strokeLinecap: "round" }),
					h("circle", { cx: x(rows.length - 1), cy: y(last.excite), r: 3, fill: "var(--dsw-alias-state-warn-primary)" }),
					h("circle", { cx: x(rows.length - 1), cy: y(last.mood), r: 3, fill: "var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary))" }),
				),
				h("div", { className: "ops-legend" },
					h("span", { className: "ops-key" }, h("i", { style: { background: "var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary))" } }), "心情"),
					h("span", { className: "ops-key" }, h("i", { style: { background: "var(--dsw-alias-state-warn-primary)" } }), "兴奋"),
					h("span", { className: "ops-note" }, (allRows.length > 30 ? "最近 30 天（共记了 " + allRows.length + " 天）" : rows.length + " 天") + " · 从 " + rows[0].label + " 到 " + last.label + "（只画记了数的日子）"),
				),
			);
		}

		function PanelPage() {
			const [data, setData] = React.useState(null);
			const [error, setError] = React.useState(null);
			const [busy, setBusy] = React.useState("");
			const [feedback, setFeedback] = React.useState(null);
			const [draft, setDraft] = React.useState(null);
			const [dirty, setDirty] = React.useState(false);
			const [tab, setTab] = React.useState("play");
			const [nextDraft, setNextDraft] = React.useState("");

			const load = React.useCallback(function (force) {
				return request("/state" + (force ? "?refresh=1" : "")).then(function (body) {
					setData(body);
					setError(null);
					return body;
				}).catch(function (err) {
					setError(err && err.message ? err.message : String(err));
					return null;
				});
			}, []);

			React.useEffect(function () {
				let alive = true;
				const tick = function () { if (alive) load(false); };
				tick();
				const timer = setInterval(tick, 8000);
				return function () {
					alive = false;
					clearInterval(timer);
				};
			}, [load]);

			React.useEffect(function () {
				if (data && data.config && draft === null) setDraft({ ...data.config });
			}, [data, draft]);

			React.useEffect(function () {
				setNextDraft(data && data.schedule ? data.schedule.nextStartAt || "" : "");
			}, [data && data.schedule ? data.schedule.nextStartAt : ""]);

			const act = function (path, label) {
				setBusy(path);
				setFeedback(null);
				return request("/" + path, { method: "POST" }).then(function (body) {
					const failed = body && body.outcome === "failed";
					setFeedback({ tone: failed ? "err" : "ok", text: (body && body.message ? body.message : label + "完成") + (body && body.steps && body.steps.length ? "\n" + body.steps.join("\n") : "") });
					return load(true);
				}).catch(function (err) {
					setFeedback({ tone: "err", text: label + "失败：" + (err && err.message ? err.message : String(err)) });
				}).finally(function () {
					setBusy("");
				});
			};

			const setField = function (key, value) {
				setDraft({ ...draft, [key]: value });
				setDirty(true);
			};

			const save = function () {
				if (!draft) return;
				setBusy("config");
				setFeedback(null);
				const body = {};
				for (const key of ["playSessionId", "scheduleSessionId", "mainSessionId", "windowMode", "gameWindowMode", "appendExperience", "gamePath", "notesFile", "port", "sessionDays", "sessionMinutes", "freezeTime", "idleSeconds", "forageRadius", "extraInstructions", "guideFile", "autoInstallMod", "gatewayEnabled", "autoContinue"]) {
					if (draft[key] !== undefined) body[key] = draft[key];
				}
				return request("/config", { method: "POST", body }).then(function (res) {
					setFeedback({ tone: res.outcome === "failed" ? "err" : "ok", text: res.message || "设置已保存" });
					setDirty(false);
					return load(false);
				}).catch(function (err) {
					setFeedback({ tone: "err", text: "保存失败：" + (err && err.message ? err.message : String(err)) });
				}).finally(function () {
					setBusy("");
				});
			};

			const setSchedule = function (body, label) {
				setBusy("schedule");
				setFeedback(null);
				return request("/schedule", { method: "POST", body }).then(function (res) {
					setFeedback({ tone: res.outcome === "failed" ? "err" : "ok", text: res.message || label });
					setNextDraft(res.nextStartAt || "");
					return load(false);
				}).catch(function (err) {
					setFeedback({ tone: "err", text: label + "失败：" + (err && err.message ? err.message : String(err)) });
				}).finally(function () {
					setBusy("");
				});
			};

			const game = data ? data.game : null;
			const live = data ? data.live : null;
			const gs = data ? data.state : null;
			const mood = data ? data.mood : null;
			const status = game ? game.status : "off";
			const latest = live && live.latest ? live.latest : null;
			const entries = (live && live.entries ? live.entries.slice(-8) : []).reverse();
			const recent = entries.slice(0, 3);
			const more = entries.slice(3);
			const update = game && game.update ? game.update : null;
			const sessionId = draft ? String(draft.playSessionId || "") : "";
			const scheduleId = draft ? String(draft.scheduleSessionId || "") : "";
			const mainId = draft ? String(draft.mainSessionId || "") : "";
			const pillTone = status === "world" ? "on" : status === "title" || status === "starting" ? "warn" : "";
			const pillText = status === "world" ? "在存档里" : status === "title" ? "在标题画面 · 还没读档" : status === "starting" ? "游戏开着 · 模组还没起来" : "游戏没开";

			const sessions = (data && data.sessions) || [];
			const sessionName = function (session) {
				return (session.title ? session.title + " · " : "") + String(session.id).slice(0, 16) + (session.running ? "（在跑）" : "");
			};
			const sessionSelect = function (name, value) {
				const options = [h("option", { key: "", value: "" }, "不指定")];
				for (const session of sessions) options.push(h("option", { key: session.id, value: session.id }, sessionName(session)));
				if (value && !sessions.some(function (s) { return s.id === value; })) options.push(h("option", { key: value, value: value }, value));
				return h("select", {
					id: "ops-" + name, className: "ops-input ops-select", value: value, disabled: Boolean(busy),
					onChange: function (e) { setField(name, e.target.value); },
				}, options);
			};
			const textInput = function (name, value, options) {
				const opts = options || {};
				return h("input", {
					id: "ops-" + name, className: "ops-input " + (opts.number ? "ops-number" : "ops-text"),
					type: opts.number ? "number" : "text", value: value === undefined || value === null ? "" : String(value),
					placeholder: opts.placeholder || "", disabled: Boolean(busy),
					onChange: function (e) { setField(name, opts.number ? Number(e.target.value) : e.target.value); },
				});
			};
			const textArea = function (name, value) {
				return h("textarea", {
					id: "ops-" + name, className: "ops-input ops-textarea", rows: 3, value: value === undefined || value === null ? "" : String(value),
					disabled: Boolean(busy), onChange: function (e) { setField(name, e.target.value); },
				});
			};

			const card = function (id, title, head, body) {
				const flexStyle = id === "ops-card-state"
					? { flex: "5 1 0", minWidth: 0 }
					: id === "ops-card-now"
						? { flex: "5 1 0", minWidth: 0 }
						: null;
				return h("section", { className: "ops-card", key: id, style: flexStyle || undefined, "aria-labelledby": id },
					h("div", { className: "ops-card-head" },
						h("h2", { className: "ops-card-title", id: id }, title),
						head ? h("div", { className: "ops-card-head-right" }, head) : null,
					),
					body,
				);
			};

			const actionRow = function (entry, index) {
				return h("div", { className: "ops-list-row" + (entry.ok === false ? " ops-fail" : ""), key: index },
					h("span", { className: "ops-list-time" }, entry.stamp ? entry.stamp.time : "—"),
					h("span", { className: "ops-list-name" }, (entry.ok === false ? "× " : "") + (entry.label || labelOfTool(entry.tool))),
					h("span", { className: "ops-list-text" }, entry.result || ""),
				);
			};

			const stateFields = [];
			if (gs) {
				stateFields.push(h(Field, { key: "time", label: "游戏日 / 时间", value: (gs.stampText || "—") + (gs.weather ? "（" + gs.weather + "）" : "") }));
				stateFields.push(h(Field, { key: "money", label: "钱", value: numberText(gs.money, " g") }));
				stateFields.push(h(Field, { key: "energy", label: "体力", value: numberText(gs.energy) + (gs.energyMax ? " / " + gs.energyMax : "") }));
				stateFields.push(h(Field, { key: "bag", label: "背包空位", value: gs.freeSlots === undefined || gs.freeSlots === null ? "—" : numberText(gs.freeSlots) + (gs.slotTotal ? "（共 " + gs.slotTotal + " 格）" : "") }));
				stateFields.push(h(Field, { key: "place", label: "地点", value: (gs.locationLabel || gs.location || "—") + (gs.location ? " · " + gs.location : "") }));
				stateFields.push(h(Field, { key: "menu", label: "当前界面", value: gs.menu || "—" }));
			} else {
				stateFields.push(h(Field, { key: "day", label: "游戏日 / 时间", value: latest && latest.stamp ? latest.stamp.label + " " + latest.stamp.time : "还没有进存档" }));
				stateFields.push(h(Field, { key: "money", label: "钱", value: "—（游戏没进存档）" }));
				stateFields.push(h(Field, { key: "energy", label: "体力", value: "—" }));
				stateFields.push(h(Field, { key: "bag", label: "背包空位", value: "—" }));
				stateFields.push(h(Field, { key: "place", label: "地点", value: live && live.locationLabel ? live.locationLabel : "—" }));
			}

			const tabBar = h("div", { className: "ops-tabs", role: "tablist", "aria-label": "星露谷管家页面" },
				[["play", "游玩管理"], ["settings", "设置"], ["about", "说明"]].map(function (pair) {
					return h("button", {
						key: pair[0], type: "button", role: "tab",
						className: "ops-tab" + (tab === pair[0] ? " ops-tab-active" : ""),
						"aria-selected": tab === pair[0],
						onClick: function () { setTab(pair[0]); },
					}, pair[1]);
				}),
			);

			const segs = [];
			if (gs) {
				segs.push((gs.stampText || "—") + (gs.weather ? " " + gs.weather : ""));
				segs.push("钱 " + numberText(gs.money, "g"));
				segs.push("体力 " + numberText(gs.energy) + (gs.energyMax ? "/" + gs.energyMax : ""));
				segs.push("背包 " + (gs.freeSlots === undefined || gs.freeSlots === null ? "—" : gs.freeSlots) + " 格");
				segs.push(gs.locationLabel || gs.location || "—");
			} else {
				segs.push(latest && latest.stamp ? latest.stamp.label + " " + latest.stamp.time : "还没进存档");
				segs.push("钱 —");
				segs.push("体力 —");
				segs.push("背包 —");
				segs.push(live && live.locationLabel ? live.locationLabel : "—");
			}
			const statusLine = h("div", { className: "ops-statusline" },
				segs.map(function (text, index) {
					if (index === 0) return h("b", { key: index }, text);
					return h(React.Fragment, { key: index }, h("span", { className: "sep" }, "·"), h("span", null, text));
				}),
			);

			const lastSummary = latest
				? (latest.stamp ? latest.stamp.time + " " : "") + (latest.label || latest.tool || "") + "，" + String(latest.result || "").slice(0, 48)
					+ (latest.ageSeconds !== null && latest.ageSeconds !== undefined ? "（" + ageText(latest.ageSeconds) + "）" : "")
				: "还没有行动记录：她还没在这个存档里动过。";

			const playTab = h(React.Fragment, null,
				h("div", { className: "ops-grid2", style: { display: "flex", gap: "10px", alignItems: "stretch" } },
				card("ops-card-state", "当前状态",
					h(React.Fragment, null,
						h(Pill, { tone: pillTone }, pillText),
						h(Button, { disabled: busy === "load", onClick: function () { setBusy("load"); load(true).finally(function () { setBusy(""); }); } }, "刷新"),
					),
					h(React.Fragment, null,
						statusLine,
						error ? h("p", { className: "ops-feedback ops-err" }, "读不到面板数据：" + error) : null,
					),
				),
				card("ops-card-now", "上次在干什么", null,
					h("details", { className: "ops-details" },
						h("summary", { className: "ops-note" }, lastSummary),
						latest ? h("div", { className: "ops-fields", style: { marginTop: 10 } },
							h(Field, { key: "result", label: "结果", value: latest.result || "—" }),
						) : null,
						entries.length ? h("div", { className: "ops-list", style: { marginTop: 8 } },
							h("div", { className: "ops-field-label", style: { marginBottom: 6 } }, "最近的动作"),
							entries.map(actionRow),
						) : null,
					),
				),
				),
				card("ops-card-mood", "心情曲线", null,
					h(React.Fragment, null,
						h(MoodChart, { rows: mood ? mood.rows : [] }),
						mood && mood.latest
							? h("div", { className: "ops-grid-fields" },
								h(Field, { key: "latest", label: "最新一天", value: mood.latest.label + " · 心情 " + mood.latest.mood + " · 兴奋 " + mood.latest.excite + (mood.days ? "（记了 " + mood.days + " 天）" : "") + (mood.gap > 0 && gs && gs.stamp ? "　⚠ 游戏已到 " + gs.stamp.seasonName + " " + gs.stamp.day + " 日" : "") }),
								mood.notWantToPlay !== null ? h(Field, { key: "p", label: "不想玩参考值", value: "≈ " + mood.notWantToPlay + "%（只显示，不执行；停不停她定）" }) : null,
							)
							: h("p", { className: "ops-note" }, mood && mood.exists === false ? "没读到心情表（找的是 " + mood.file + "）" : "心情表里还没有记数。"),
					),
				),
				card("ops-card-actions", "操作",
					update ? h("span", { className: "ops-note" }, "模组 " + (update.installed || "没装") + " · 最新 " + (update.latest || "?") + (update.available ? "（有新版）" : "")) : null,
					h(React.Fragment, null,
						h("div", { className: "ops-actions" },
							h(Button, { primary: true, disabled: Boolean(busy) || (status !== "off" && status !== "title"), onClick: function () { act("start", "开始游戏"); } }, busy === "start" ? "正在拉起…" : "开始游戏"),
							h(Button, { warn: true, disabled: Boolean(busy) || status === "off", onClick: function () { act("stop", "停止"); } }, busy === "stop" ? "正在停…" : "停止行动"),
							h(Button, { ok: true, disabled: Boolean(busy) || status === "off", onClick: function () { act("resume", "恢复"); } }, busy === "resume" ? "正在恢复…" : "恢复行动"),
							h(Button, { danger: true, disabled: Boolean(busy) || status === "off", onClick: function () { act("close", "关游戏"); } }, busy === "close" ? "正在关…" : "关掉游戏"),
							h(Button, { info: true, disabled: Boolean(busy) || status !== "world", onClick: function () { act("sleep", "强制睡觉"); } }, busy === "sleep" ? "正在回家…" : "强制回家睡觉"),
						),
						h("div", { className: "ops-actions", style: { marginTop: 8 } },
							h(Button, { disabled: Boolean(busy), onClick: function () { act("update-check", "检查 MOD 更新"); } }, busy === "update-check" ? "正在查…" : "检查 MOD 更新"),
							update && update.available ? h(Button, { primary: true, disabled: Boolean(busy), onClick: function () { act("update-apply", "更新"); } }, busy === "update-apply" ? "正在装…" : "更新到 " + update.latest) : null,
							h(Button, { disabled: Boolean(busy), onClick: function () { act("append-experience", "追加经验"); } }, "追加经验"),
							h(Button, { disabled: Boolean(busy) || !mainId, onClick: function () { act("notes", "发摘要"); } }, "发摘要给主会话"),
						),
						feedback ? h("p", { className: "ops-feedback " + (feedback.tone === "ok" ? "ops-ok" : "ops-err"), role: "status" }, feedback.text) : null,
						h("p", { className: "ops-notice" }, "关游戏查存档：最后一条不是 sleep 就不关。强制回家睡觉失败就停，不硬睡。"),
						h("p", { className: "ops-note" },
							(sessionId ? "" : "还没选会话：开始只拉起游戏，没人会去读档。")
							+ (data && data.schedule && data.schedule.nextStartAt ? " 下次开玩：" + String(data.schedule.nextStartAt).replace("T", " ") + "。" : " 还没排下次开玩。")
							+ (data && data.schedule && data.schedule.push && data.schedule.push.message ? " 上次收工：" + data.schedule.push.message : "")),
					),
				),
			);

			const settingsTab = h(React.Fragment, null,
				feedback ? h("p", { className: "ops-feedback " + (feedback.tone === "ok" ? "ops-ok" : "ops-err") }, feedback.text) : null,
				card("ops-card-session", "会话", null,
					h("div", { className: "ops-rows" },
						h(SettingRow, { label: "玩游戏的会话", desc: "开始游戏/定时开玩时叫哪个会话去读档。只列普通会话，子代理会话不能选。" }, sessionSelect("playSessionId", sessionId)),
						h(SettingRow, { label: "自启会话", desc: "玩完之后，把「下次什么时候开」交给这个会话判：关游戏时会收到状态、心情和参考值。留空就不推。" }, sessionSelect("scheduleSessionId", scheduleId)),
						h(SettingRow, { label: "主会话", desc: "关游戏或点「发摘要」时，往这个会话推一条这次的摘要。" }, sessionSelect("mainSessionId", mainId)),
					),
				),
				card("ops-card-launch", "启动与定时", null,
					h(React.Fragment, null,
						h("div", { className: "ops-rows" },
							h(SettingRow, { label: "SMAPI 窗口", desc: "启动游戏时控制台窗口怎么处理；隐藏后日志照常写在 Mods\\BlindWhaleFarmer\\logs。" },
								h("select", {
									id: "ops-windowMode", className: "ops-input ops-select", value: draft ? draft.windowMode : "minimized", disabled: Boolean(busy),
									onChange: function (e) { setField("windowMode", e.target.value); },
								},
									h("option", { value: "minimized" }, "最小化（默认）"),
									h("option", { value: "hidden" }, "隐藏"),
									h("option", { value: "normal" }, "正常显示"),
								)),
									h(SettingRow, { label: "游戏窗口", desc: "启动游戏时游戏画面那个窗口怎么处理。跟上面的 SMAPI 控制台分开管：可以只藏控制台、留游戏画面。" },
										h("select", {
											id: "ops-gameWindowMode", className: "ops-input ops-select", value: draft ? draft.gameWindowMode : "normal", disabled: Boolean(busy),
											onChange: function (e) { setField("gameWindowMode", e.target.value); },
										},
										h("option", { value: "normal" }, "正常显示（默认）"),
										h("option", { value: "minimized" }, "最小化"),
										h("option", { value: "hidden" }, "隐藏"),
										)),
							h(SettingRow, { label: "下次开玩", desc: "一次性：到点拉起游戏并叫「玩游戏的会话」。模型用 schedule 动作定，也可以在这里手动设。" },
								h(React.Fragment, null,
									h("input", {
										id: "ops-nextStartAt", type: "datetime-local", className: "ops-input ops-select",
										value: nextDraft, disabled: Boolean(busy),
										onChange: function (e) { setNextDraft(e.target.value); },
									}),
									h(Button, { disabled: Boolean(busy) || !nextDraft, onClick: function () { setSchedule({ at: nextDraft }, "保存定时"); } }, busy === "schedule" ? "保存中…" : "保存"),
									h(Button, { disabled: Boolean(busy), onClick: function () { setSchedule({ clear: true }, "清除定时"); } }, "清除"),
								)),
							h(CheckRow, { name: "appendExperience", label: "玩完追加经验", desc: "关游戏时把这次的状态摘要追加到 笔记\\星露谷经验.md。", checked: draft ? draft.appendExperience : false, disabled: Boolean(busy), onChange: function (v) { setField("appendExperience", v); } }),
						),
						h("p", { className: "ops-note" },
							"下次开玩：" + (data && data.schedule && data.schedule.nextStartAt ? String(data.schedule.nextStartAt).replace("T", " ") : "没有排") + "。"
							+ (data && data.schedule && data.schedule.last && data.schedule.last.message ? " 上次定时：" + data.schedule.last.message : "")
							+ (data && data.schedule && data.schedule.push && data.schedule.push.message ? " 上次收工推送：" + data.schedule.push.message : "")),
					),
				),
				card("ops-card-settings", "游戏与模组", null,
					h("div", { className: "ops-rows" },
						h(SettingRow, { label: "星露谷目录", desc: "里面有 StardewModdingAPI.exe 的文件夹；留空自动在 Steam/GOG 库里找。" }, draft ? textInput("gamePath", draft.gamePath, { placeholder: "留空自动找" }) : null),
						h(SettingRow, { label: "游戏端口", desc: "和模组 config.json 的 McpPort 一致。" }, draft ? textInput("port", draft.port, { number: true }) : null),
						h(SettingRow, { label: "每次最多玩几个游戏日", desc: "0 = 不限。睡一觉算一天。" }, draft ? textInput("sessionDays", draft.sessionDays, { number: true }) : null),
						h(SettingRow, { label: "每次最多玩多少分钟", desc: "0 = 不限。到点先回家睡觉再停。" }, draft ? textInput("sessionMinutes", draft.sessionMinutes, { number: true }) : null),
						h(SettingRow, { label: "空闲多少秒算不玩了", desc: "超过这个时间没有新指令，游戏整个暂停。" }, draft ? textInput("idleSeconds", draft.idleSeconds, { number: true }) : null),
						h(SettingRow, { label: "顺手采集范围（格）", desc: "走路时顺手采野菜、贝壳的范围；0 = 不采。" }, draft ? textInput("forageRadius", draft.forageRadius, { number: true }) : null),
						h(SettingRow, { label: "攻略文件", desc: "相对 Mods\\BlindWhaleFarmer。要换打法就复制一份改名后填这里。" }, draft ? textInput("guideFile", draft.guideFile, { placeholder: "guide/攻略.md" }) : null),
						h(SettingRow, { label: "给 AI 的额外要求", desc: "比如：这次专心钓鱼，攒钱买背包。每次读游戏状态都会看到。" }, draft ? textArea("extraInstructions", draft.extraInstructions) : null),
						h(SettingRow, { label: "心情记录文件", desc: "心情曲线读哪个文件；留空自动找 笔记\\星露谷笔记.md。" }, draft ? textInput("notesFile", draft.notesFile, { placeholder: "留空自动找" }) : null),
					),
				),
			);

			const aboutTab = card("ops-card-about", "说明", null,
				h(React.Fragment, null,
					h("div", { className: "ops-fields" },
						h(Field, { key: "meta", label: "模组 / 端口", value: ((game && game.modInstalled) || "没装") + " · " + ((game && game.port) || "?") }),
						h(Field, { key: "version", label: "插件版本", value: (data && data.version) || "—" }),
						h(Field, { key: "file", label: "行动记录", value: live && live.file ? shortName(live.file) + (live.ageText ? "（" + live.ageText + "）" : "") : "没有", mono: true }),
						h(Field, { key: "notes", label: "心情表", value: mood ? mood.file : "—", mono: true }),
					),
					h("p", { className: "ops-note" }, "看 AI 玩星露谷：状态、心情、操作和设置。数据全在本机，不截图、不额外调游戏的 MCP。作者那五篇攻略在 Mods\\BlindWhaleFarmer\\guide，只读，这里不改它。"),
					h("p", { className: "ops-credit" },
						h("b", null, "玩法、模组和插件是 Darian（github.com/Darianliu23）做的；"),
						"星露谷管家是兮兮与爸爸在 MIT 许可下改的独立插件，只在他的基础上钉了几个钉子。"),
				),
			);

			const saveBar = dirty || busy === "config" ? h("div", { className: "ops-savebar", role: "status" },
				h("span", { className: "ops-savebar-text" }, busy === "config" ? "正在保存…" : "有改动，还没保存"),
				h(Button, { primary: true, disabled: Boolean(busy) || !dirty, onClick: save }, busy === "config" ? "保存中…" : "保存设置"),
				h(Button, { disabled: Boolean(busy), onClick: function () { setDraft(data ? { ...data.config } : null); setDirty(false); setFeedback(null); } }, "撤销"),
			) : null;

			return h("div", { className: "ops", style: { display: "flex", flexDirection: "column", gap: "10px", maxWidth: "780px" } },
				h(Style),
				h("header", { className: "ops-head" },
					h("h1", { className: "ops-title" }, "星露谷管家"),
					h("p", { className: "ops-sub" }, "看 AI 玩星露谷：状态、心情、操作和设置，数据都在本机。"),
				),
				tabBar,
				h("div", { role: "tabpanel", className: "ops-tabpanel", style: { display: "flex", flexDirection: "column", gap: "10px" }, key: tab },
					tab === "play" ? playTab : tab === "settings" ? settingsTab : aboutTab,
				),
				saveBar,
			);
		}

		module.exports.name = PACKAGE + "-client";
		module.exports.inject = ["slots"];
		module.exports.apply = function apply(ctx) {
			ctx.slots.inject("settings.section", function () {
				return ctx.slots.register(
					{ name: "settings.section", id: PACKAGE, order: 32, label: function () { return "星露谷管家"; } },
					PanelPage,
				);
			});
		};
		return module.exports;
	},
});