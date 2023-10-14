import van from "vanjs-core";
import htm from "htm";
import "./index.css";
if (!window.IS_PRODUCTION) {
    new EventSource("/esbuild").addEventListener("change", () => location.reload());
}

let w = window;
w.localHostnames = w.localHostnames ?? [];

w.localHostnames.push("localhost");
w.localHostnames.push("127.0.0.1");

const isLocalhost = w.localHostnames.includes(location.hostname);
console.log(isLocalhost ? "LOCALHOST, using fetch" : "REMOTE, using file input");
//UTILS
function h(type, props, ...children) {
    const tag = van.tags[type];
    if (props) return tag(props, ...children);
    return tag(...children);
}
const html = htm.bind(h);
const compareArrays = (a, b) => a.length === b.length && a.every((element, index) => element === b[index]);
/**
 * @param {string} text
 * @returns {string}
 * */
const trimAndRemoveScripts = text => {
    let trimmedText = text.trim();
    trimmedText = trimmedText.substring(trimmedText.indexOf("\n") + 1);
    return trimmedText.substring(trimmedText.lastIndexOf("\n") + 1, -1).trim();
};
const clamp = (num, min, max) => Math.min(Math.max(num, min), max);

//STATE
let files = van.state([]);

const alumnName = van.state(isLocalhost ? localStorage.getItem("alumnName") ?? "V" : "");
van.derive(() => {
    localStorage.setItem("alumnName", alumnName.val);
});

const qualifiedName = () => `ET1_${alumnName.val.length > 0 ? alumnName.val : "%NAME%"}`;
/**
 * @typedef {Object} Error
 * @property {string} error
 * @property {number} [lineNumber]
 * @property {number} [columnNumber]
 * @property {string} [stack]
 * @property {string} [message]
 * @property {string} [line]
 */

/**
 * @type {import("vanjs-core").State<Array<Error>>}
 */
let globalErrors = van.state([]);

let alumnData = van.state(undefined);
let definitions = van.state(undefined);
let tests = van.state(undefined);
let sort = van.state(false);

const fetchOrExtract = async filename => {
    if (isLocalhost) {
        let resp = await fetch(`/${qualifiedName()}/${filename}`, { cache: "no-store" });
        if (resp.ok) {
            return await resp.text();
        }
    }
    let reg = undefined;
    if (filename.includes("pruebas")) {
        reg = /ET1_(.*?)_pruebas\.js/;
    } else if (filename.includes("tests")) {
        reg = /ET1_(.*?)_tests\.js/;
    } else {
        reg = /ET1_([^_]*?)\.js/;
    }
    let file = files.val.find(f => reg.test(f.name));
    if (file) {
        return await file.text();
    }
    return null;
};

van.derive(async () => {
    let shouldSort = sort.val;
    alumnData.val = undefined;
    definitions.val = undefined;
    tests.val = undefined;

    const localErrors = [];
    if (isLocalhost && alumnName.val.length < 1) {
        localErrors.push({
            error: "El nombre del alumno debe tener al menos 1 caracter",
        });
        globalErrors.val = localErrors;
        return;
    }
    const alumnDataResponse = await fetchOrExtract(`${qualifiedName()}.js`);

    if (alumnDataResponse) {
        let alumnDataText = trimAndRemoveScripts(alumnDataResponse);
        try {
            window[`datosgenerales_${alumnName.val}`] = undefined;

            eval(alumnDataText);
            let captured = window[`datosgenerales_${alumnName.val}`];

            window[`datosgenerales_${alumnName.val}`] = undefined;
            alumnData.val = captured;
        } catch (e) {
            let line = alumnDataText.split("\n")[e.lineNumber - 1];
            let trimmedLine = line.trim();
            let lengthDiff = line.length - trimmedLine.length;
            if (e instanceof ReferenceError) {
                /**@type any */
                e = e;
                localErrors.push({
                    error: `Comprueba que has definido la variable datosgenerales_${alumnName.val} correctamente`,
                    message: e.toString(),
                    lineNumber: e.lineNumber + 1,
                    line: trimmedLine,
                    columnNumber: clamp(e.columnNumber - lengthDiff, 0, line.length),
                    stack: e.stack,
                });
            } else {
                localErrors.push({
                    error: "Error al evaluar los datos del alumno",
                    message: e.toString(),
                    lineNumber: e.lineNumber + 1,
                    line: trimmedLine,
                    columnNumber: clamp(e.columnNumber - lengthDiff, 0, line.length),

                    stack: e.stack,
                });
            }
        }
    } else {
        localErrors.push({
            error: `Error al obtener los datos del alumno ${
                alumnName.val
            }, asegúrate de que el fichero se llama ${qualifiedName()}.js ${
                isLocalhost ? `y está en la carpeta ${qualifiedName()} ` : ""
            }`,
        });
    }

    //Definitions
    const definitionsResponse = await fetchOrExtract(`${qualifiedName()}_tests.js`);
    if (definitionsResponse) {
        let definitionsText = trimAndRemoveScripts(definitionsResponse);
        try {
            window[`def_test_${alumnName.val}`] = undefined;

            eval(definitionsText);
            let captured = window[`def_test_${alumnName.val}`];
            captured = shouldSort ? captured.sort() : captured;

            window[`def_test_${alumnName.val}`] = undefined;

            definitions.val = captured;
        } catch (e) {
            let line = definitionsText.split("\n")[e.lineNumber - 1];
            let trimmedLine = line.trim();
            let lengthDiff = line.length - trimmedLine.length;
            if (e instanceof ReferenceError) {
                /**@type any */
                e = e;

                localErrors.push({
                    error: `Comprueba que has definido la variable def_test_${alumnName.val} correctamente`,
                    message: e.toString(),
                    lineNumber: e.lineNumber + 1,
                    line: trimmedLine,
                    columnNumber: clamp(e.columnNumber - lengthDiff, 0, line.length),
                    stack: e.stack,
                });
            } else {
                localErrors.push({
                    error: "Error al evaluar las definiciones de los tests",
                    message: e.toString(),
                    lineNumber: e.lineNumber + 1,
                    line: trimmedLine,
                    columnNumber: clamp(e.columnNumber - lengthDiff, 0, line.length),
                    stack: e.stack,
                });
            }
        }
    } else {
        localErrors.push({
            error: `Error al obtener las definiciones de los tests, asegúrate de que el fichero se llama  ${qualifiedName()}_tests.js ${
                isLocalhost ? `y está en la carpeta ${qualifiedName()} ` : ""
            }`,
        });
    }

    //Tests
    const testsResponse = await fetchOrExtract(`${qualifiedName()}_pruebas.js`);

    if (testsResponse) {
        let testsText = trimAndRemoveScripts(testsResponse);
        try {
            window[`pruebasunitarias_${alumnName.val}`] = undefined;

            eval(testsText);

            let captured = window[`pruebasunitarias_${alumnName.val}`];
            captured = shouldSort ? captured.sort() : captured;
            window[`pruebasunitarias_${alumnName.val}`] = undefined;
            tests.val = captured;
        } catch (e) {
            let line = testsText.split("\n")[e.lineNumber - 1];
            let trimmedLine = line.trim();
            let lengthDiff = line.length - trimmedLine.length;

            if (e instanceof ReferenceError) {
                /**@type any */
                e = e;
                localErrors.push({
                    error: `Comprueba que has definido la variable pruebasunitarias_${alumnName.val} correctamente`,
                    message: e.toString(),
                    lineNumber: e.lineNumber + 1,
                    line: trimmedLine,
                    columnNumber: clamp(e.columnNumber - lengthDiff, 0, line.length),
                    stack: e.stack,
                });
            } else {
                localErrors.push({
                    error: "Error al evaluar las pruebas",
                    message: e.toString(),
                    lineNumber: e.lineNumber + 1,
                    line: trimmedLine,
                    columnNumber: clamp(e.columnNumber - lengthDiff, 0, line.length),
                    stack: e.stack,
                });
            }
        }
    } else {
        localErrors.push({
            error: `Error al obtener las pruebas, asegúrate de que el fichero se llama ${qualifiedName()}_pruebas.js ${
                isLocalhost ? `y está en la carpeta ${qualifiedName()} ` : ""
            }`,
        });
    }
    globalErrors.val = localErrors;
});

//COMPONENTS
/**
 *
 * @param {Object} tableData
 * @param {Array<{name: string, colspan?: number}>} tableData.head
 * @param {Array} tableData.data
 * @returns
 */
const Table = ({ head, data }) =>
    html`
        <div class="table-container">
            <table>
                ${head.length !== 0 &&
                html`
                    <thead>
                        <tr>
                            ${head.map(h => html`<th colspan=${h.colspan ?? 1}>${h.name}</th>`)}
                        </tr>
                    </thead>
                `}
                <tbody>
                    ${data.map(
                        row => html`
                            <tr>
                                ${row.map(col => html`<td>${col}</td>`)}
                            </tr>
                        `
                    )}
                </tbody>
            </table>
        </div>
    `;

const AlumnDataResult = () => html`
    ${() =>
        alumnData.val !== undefined
            ? html`<div
                  id="datosgenerales"
                  style="display: block;">
                  <div id="${alumnData.val[1]}">
                      <h1>${alumnName.val}</h1>
                      <p>Entrega: ${alumnData.val[1]}</p>
                      <p>Nombre: ${alumnData.val[0]}</p>
                      <p>Horas dedicadas: ${alumnData.val[2]}</p>
                  </div>
              </div>`
            : ""}
`;
const DefinitionResultTable = () => html`
    ${() =>
        definitions.val !== undefined
            ? html`<div
                  id="testdefiniciones"
                  style="display: block;">
                  <h1>Resultado estructura definición tests</h1>
                  <p id="resultadodef">formato correcto en deficiones test</p>
                  <div id="div_tabla_def">
                      ${Table({
                          head: [
                              {
                                  name: "Campo",
                              },
                              {
                                  name: "CampoNum Def Test",
                              },
                              {
                                  name: "Datos",
                                  colspan: 5,
                              },
                              {
                                  name: "Resultado",
                              },
                          ],
                          // @ts-ignore
                          data: definitions.val.map((row, i) => {
                              // @ts-ignore
                              const [field, numDefTest, ...data] = row;
                              let dataTypes = row.map(d => typeof d);
                              //   string	number	string	boolean	string
                              //   Compare thedataTypes with the expected data types
                              let validDataTypes = ["string", "number", "string", "boolean", "string"];
                              const isCorrect = compareArrays(dataTypes, validDataTypes);
                              if (!isCorrect) {
                                  for (let i = 0; i < dataTypes.length; i++) {
                                      if (dataTypes[i] !== validDataTypes[i]) {
                                          dataTypes[i] = html`<p>
                                              <b>${dataTypes[i]}</b>
                                          </p>`;
                                      } else {
                                          dataTypes[i] = dataTypes[i];
                                      }
                                  }
                              }

                              return [field, numDefTest, ...dataTypes, isCorrect ? "CORRECTA" : html`<b>ERROR</b>`];
                          }),
                      })}
                  </div>
              </div>`
            : ""}
`;

const TestResultTable = () => html`
    ${() =>
        tests.val !== undefined
            ? html`<div
                  id="testpruebas"
                  style="display: block;">
                  <h1>Resultado estructura definición pruebas</h1>
                  <p id="resultadodef">formato correcto en las pruebas de test</p>
                  <div id="div_tabla_def">
                      ${Table({
                          head: [
                              {
                                  name: "Campo",
                              },
                              {
                                  name: "CampoNum Def Test",
                              },
                              {
                                  name: "Datos",
                                  colspan: 5,
                              },
                              {
                                  name: "Resultado",
                              },
                          ],
                          // @ts-ignore
                          data: tests.val.map((row, i) => {
                              // @ts-ignore
                              const [numDefTest, field, ...data] = row;
                              let dataTypes = row.map(d => typeof d);
                              //   string	number	string	boolean	string
                              //   Compare thedataTypes with the expected data types
                              let validDataTypes = ["number", "string", "number", "string", "boolean"];
                              const isCorrect = compareArrays(dataTypes, validDataTypes);
                              if (!isCorrect) {
                                  for (let i = 0; i < dataTypes.length; i++) {
                                      if (dataTypes[i] !== validDataTypes[i]) {
                                          dataTypes[i] = html`<b>${dataTypes[i]}</b>`;
                                      } else {
                                          dataTypes[i] = dataTypes[i];
                                      }
                                  }
                              }
                              return [field, numDefTest, ...dataTypes, isCorrect ? "CORRECTA" : html`<b>ERROR</b>`];
                          }),
                      })}
                  </div>
              </div>`
            : ""}
`;
// van.add(
//     document.body,
//     TestDefinitionResult([
//         [1, "John Doe", "US", 2, 3],
//         [2, "Jane Smith", "CA", 5, 6],
//         [3, "Bob Johnson", "AU", 7, 8],
//     ])
// );
const TestPerDefinitionTable = () => html`
    ${() =>
        definitions.val !== undefined && tests.val !== undefined
            ? html`<div
                  id="pruebasentest"
                  style="display: block;">
                  <h1>Número de pruebas por test</h1>

                  <div id="div_tabla_test">
                      ${Table({
                          head: [
                              {
                                  name: "Test",
                              },
                              {
                                  name: "Resultado",
                              },
                          ],
                          // @ts-ignore
                          data: definitions.val.map((row, i) => {
                              // @ts-ignore
                              const [field, numDefTest, condition, result, friendlyMessage] = row;
                              const currentFieldTests = tests.val.filter(
                                  test => test[1] == field && test[0] == numDefTest
                              );

                              const definedTestAmount = currentFieldTests.length;
                              if (definedTestAmount >= 2) {
                                  const trueTestAmount = currentFieldTests.filter(test => test[4] == true).length;
                                  const falseTestAmount = currentFieldTests.filter(test => test[4] == false).length;
                                  if (trueTestAmount && falseTestAmount) {
                                      return [
                                          `En el campo ${field} para el test definido ${numDefTest} existen ${definedTestAmount} pruebas => (${trueTestAmount} de exito y ${falseTestAmount} de error).`,
                                          "CORRECTA",
                                      ];
                                  }
                                  return [
                                      `En el campo ${field} para el test definido ${numDefTest} => existen ${definedTestAmount} pruebas, pero hace falta 1 
                                      ${falseTestAmount < trueTestAmount ? "prueba de error" : "prueba de exito"}`,
                                      van.tags.b("ERROR"),
                                  ];
                              } else {
                                  return [
                                      `En el campo ${field} para el test definido ${numDefTest} debería existir al menos una prueba de exito y una de error`,
                                      van.tags.b("ERROR"),
                                  ];
                              }
                          }),
                      })}
                  </div>
              </div>`
            : ""}
`;
// const TestPerDefinitionTable = data => html`
//     <div
//         id="testperdef"
//         style="display: block;">
//         <h1>Resultado de los tests</h1>
//         <p id="resultadotest">formato correcto en test</p>
//         <div id="div_tabla_test">
//             ${Table({
//                 head: [],
//                 data,
//             })}
//         </div>
//     </div>
// `;
const debounce = (func, wait, immediate) => {
    let timeout;
    return function executedFunction() {
        const context = this;
        const args = arguments;
        const later = function () {
            timeout = null;
            if (!immediate) func.apply(context, args);
        };
        const callNow = immediate && !timeout;
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
        if (callNow) func.apply(context, args);
    };
};
const AlumnNameInput = () => html`
    <div class=${() => (globalErrors.val.length == 0 ? "valid input-container name" : "input-container name")}>
        <div class="name-input-sub">
            <label for="alumnname">Nombre del alumno</label>
            <input
                type="text"
                id="alumnname"
                name="alumnname"
                value=${alumnName}
                autocomplete="off"
                oninput=${debounce(e => (alumnName.val = e.target.value), 500)} />
        </div>
        <button onclick=${() => location.reload()}>Recargar</button>
        <label
            class="sort-label"
            for="should-sort"
            >SORT</label
        >
        <input
            class="should-sort"
            type="checkbox"
            onclick=${() => (sort.val = !sort.val)}
            checked=${() => sort.val} />
    </div>
`;
const parseFiles = filesArray => {
    //Find preferred name
    let reg = undefined;
    let nameMap = new Map();
    filesArray.forEach(f => {
        if (f.name.includes("pruebas")) {
            reg = /ET1_(.*?)_pruebas\.js/;
        } else if (f.name.includes("tests")) {
            reg = /ET1_(.*?)_tests\.js/;
        } else {
            reg = /ET1_(.*?)\.js/;
        }
        nameMap.set(f.name.match(reg)[1], nameMap.get(f.name.match(reg)[1]) + 1 || 1);
    });
    const preferredName = [...nameMap.entries()].sort((a, b) => b[1] - a[1])[0][0];
    alumnName.val = preferredName;

    let oldFiles = files.val;
    let newFiles = filesArray.filter(f => !oldFiles.find(of => of.name === f.name));

    let filesToKeep = oldFiles.filter(f => {
        if (f.name.includes("pruebas")) {
            reg = /ET1_(.*?)_pruebas\.js/;
        } else if (f.name.includes("tests")) {
            reg = /ET1_(.*?)_tests\.js/;
        } else {
            reg = /ET1_(.*?)\.js/;
        }
        return reg.exec(f.name)[1] === preferredName;
    });

    let filesToAdd = newFiles.filter(f => {
        if (f.name.includes("pruebas")) {
            reg = /ET1_(.*?)_pruebas\.js/;
        } else if (f.name.includes("tests")) {
            reg = /ET1_(.*?)_tests\.js/;
        } else {
            reg = /ET1_(.*?)\.js/;
        }
        return reg.exec(f.name)[1] === preferredName;
    });

    files.val = [...filesToKeep, ...filesToAdd];
};
function dropHandler(ev) {
    // Prevent default behavior (Prevent file from being opened)
    ev.preventDefault();
    let droppedFiles = [];
    if (ev.dataTransfer.items) {
        // Use DataTransferItemList interface to access the file(s)
        [...ev.dataTransfer.items].forEach((item, i) => {
            // If dropped items aren't files, reject them
            if (item.kind === "file") {
                const file = item.getAsFile();
                droppedFiles.push(file);
            }
        });
    } else {
        // Use DataTransfer interface to access the file(s)
        [...ev.dataTransfer.files].forEach((file, i) => {
            droppedFiles.push(file);
        });
    }
    parseFiles(droppedFiles);
}

const FileDropZone = () => {
    const handleFileChange = e => {
        const targetFiles = e.target.files;
        let filesArray = Array.from(targetFiles);
        parseFiles(filesArray);
    };
    return html`
        <div class=${() => (globalErrors.val.length == 0 ? "valid input-container file" : "input-container file")}>
            <div class="file-input-sub">
                <label
                    for="file-drop-zone-input"
                    ondrop=${e => {
                        e.target.classList.remove("dragover");
                        dropHandler(e);
                    }}
                    ondragover=${e => e.target.classList.add("dragover")}
                    ondragleave=${e => e.target.classList.remove("dragover")}
                    >+</label
                >
                <input
                    type="file"
                    id="file-drop-zone-input"
                    name="file-drop-zone-input"
                    multiple
                    onchange=${handleFileChange}
                    accept=".js" />
            </div>
            <!-- <button onclick=${() => location.reload()}>Recargar</button> -->
            <div>Arrastra tus archivos o pulsa en el +<br />(repite cada vez que hagas cambios)</div>
            <label
                class="sort-label"
                for="should-sort"
                >SORT</label
            >
            <input
                class="should-sort"
                type="checkbox"
                onclick=${() => (sort.val = !sort.val)}
                checked=${() => sort.val} />
        </div>
        <h2>Alumno: ${() => (alumnName.val.length < 1 ? "DESCONOCIDO" : alumnName.val)}</h2>
        <div class="file-list">
            ${() =>
                files.val.length !== 0
                    ? html`<ul>
                          ${files.val.map(
                              file => html`<li>
                                  <p>${file.name}</p>
                              </li>`
                          )}
                      </ul>`
                    : ""}
        </div>
    `;
};
const ErrorItem = error => html`
    <li class="error-item">
        <p>${error.error}</p>
        ${error.message
            ? html`<p>
                  ${error.message} at line ${error.lineNumber} column ${error.columnNumber}
                  <p>${html`
                      ${error.line.substring(0, clamp(error.columnNumber - 3, 0, error.columnNumber))}
                      <b>
                          ${error.line.substring(
                              clamp(error.columnNumber - 3, 0, error.line.length),
                              clamp(error.columnNumber + 2, 0, error.line.length)
                          )}
                      </b>
                      ${error.line.substring(clamp(error.columnNumber + 2, 0, error.line.length))}
                  `}
                </p>
              </p>`
            : ""}
    </li>
`;
const ErrorList = () => html`
    ${() =>
        globalErrors.val.length !== 0
            ? html`<div class="errors">
                  <h1>Errores</h1>
                  <ul class="error-list">
                      ${globalErrors.val.map(error => ErrorItem(error))}
                  </ul>
              </div>`
            : ""}
`;

//RENDER
if (isLocalhost) {
    van.add(document.body, AlumnNameInput());
} else {
    van.add(document.body, FileDropZone());
}
van.add(document.body, html`<hr style="width:80%;" />`);
van.add(document.body, ErrorList());
van.add(document.body, AlumnDataResult());
van.add(document.body, DefinitionResultTable());
van.add(document.body, TestResultTable());

van.add(document.body, TestPerDefinitionTable());
