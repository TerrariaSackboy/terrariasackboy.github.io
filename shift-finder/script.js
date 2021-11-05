/*
This is the accompanying script for my Shift Finder web app.
*/

const MAX_AUTOSAVED_SCHEDULES = 3;

let scheduleObject;
let loadedScheduleTemplates = [];
let scheduleTemplates = {};
let autosavedSchedules = [];
let lastSavedSchedule;
let rowUidCounter = 0;
let shownDays = [];
let nDirtyCells = 0;
let selectedRowUid; // Misnomer: this is the row whose extbutton is clicked
let timeTemplates = [];

let hoveredRowUid;

window.addEventListener('load', function ()
{
    let hideDaysMenu = document.querySelector('#hidedaysmenu');
    let hideDaysContextMenu = hideDaysMenu.querySelector('.contextmenu');
    let contextButtons = document.getElementsByClassName('contextbutton');
    let contextMenus = document.getElementsByClassName('contextmenu');
    let bigMenus = [
        document.querySelector('#exportmenu'),
        document.querySelector('#importmenu'),
        document.querySelector('#templatemenu')
    ];
    
    // Initialize vars
    scheduleObject = document.querySelector('#schedule');

    // Load saved data
    loadShownDays();
    loadTemplates();
    autosavedSchedules = JSON.parse(localStorage.getItem('autosavedSchedules')) || [];

    // Add event listeners
    document.documentElement.addEventListener('mousemove', e =>
    {
        document.documentElement.style.setProperty('--mouse-x', e.clientX + 'px');
        document.documentElement.style.setProperty('--mouse-y', e.clientY + 'px');
    });

    updateViewportSizeVars();
    document.defaultView.addEventListener('resize', updateViewportSizeVars);

    for (let contextButton of contextButtons)
    {
        contextButton.addEventListener('click', e =>
        {
            let menu = e.target.parentElement.querySelector('.contextmenu');
            // NOTE: Undefined behavior with nested context menus;
            //  more testing required
            menu.classList.add('shown');
        });
    }
    for (let contextMenu of contextMenus)
    {
        contextMenu.addEventListener('mouseleave', e =>
        {
            e.target.classList.remove('shown');
        });
    }

    document.querySelector('#exportjsonbutton').addEventListener('click', e =>
    {
        let menu = document.querySelector('#exportmenu');
        menu.classList.add('shown');

        // Populate
        menu.querySelector('textarea').value = JSON.stringify(serializeSchedule());
    });
    document.querySelector('#importjsonbutton').addEventListener('click', e =>
    {
        document.querySelector('#importmenu').classList.add('shown');
    });
    document.querySelector('#loadsavedbutton').addEventListener('click', e =>
    {
        // TODO: modifying autosaved schedules
        let scheduleList = document.querySelector('#savedscheduleslist');
        
        for (let item of scheduleList.querySelectorAll('li'))
        {
            item.remove();
        }
        for (let iSchedule = 0; iSchedule < autosavedSchedules.length; iSchedule++)
        {
            let scheduleData = autosavedSchedules[iSchedule];
            let li = document.createElement('Li');
            scheduleList.appendChild(li);

            let button = document.createElement('A');
            li.appendChild(button);
            button.setAttribute('class', 'button');
            button.setAttribute('href', '#');
            button.addEventListener('click', e =>
            {
                scheduleList.classList.remove('shown');
                initializeSchedule();
                loadSchedule(scheduleData.schedule);
            });
            button.innerHTML = 'Autosaved' + (iSchedule + 1);

            let timestamp = document.createElement('Span');
            li.appendChild(timestamp);
            timestamp.classList.add('timestamp');
            timestamp.innerHTML = scheduleData.timestamp;
        }
    });
    document.querySelector('#templatebutton').addEventListener('click', e =>
    {
        let menu = document.querySelector('#templatemenu');
        menu.classList.add('shown');

        // Populate
        let templateData = '';
        for (let template of timeTemplates)
        {
            templateData += (template + '\n');
        }
        menu.querySelector('textarea').value = templateData;
    });

    document.querySelector('#importbutton').addEventListener('click', e =>
    {
        let menu = document.querySelector('#importmenu');
        let data = JSON.parse(menu.querySelector('textarea').value);
        menu.classList.remove('shown');

        // Reset and fill schedule
        initializeSchedule();
        loadSchedule(data);
    });
    document.querySelector('#updatetemplatesbutton').addEventListener('click', e =>
    {
        let menu = document.querySelector('#templatemenu');
        let data = menu.querySelector('textarea').value;
        menu.classList.remove('shown');
        
        let lines = data.split('\n');
        timeTemplates = [];
        console.log(lines);
        for (let line of lines)
        {
            if (line.length > 0)
            {
                timeTemplates.push(line);
            }
        }
    });

    for (let menu of bigMenus)
    {
        // TODO: 'X' Buttons
        menu.addEventListener('mouseleave', e =>
        {
            e.target.classList.remove('shown');
        });
    }

    // Hidedays menu
    for (let i = 0; i < 7; i++)
    {
        let checkbox = hideDaysContextMenu.children[i].children[0];
        checkbox.checked = shownDays[i];
        checkbox.addEventListener('input', (event) =>
        {
            if (event.target.checked)
                showDay(i);
            else
                hideDay(i);
        });
    }

    // Extbutton menu
    document.querySelector('#savetemplatebutton').addEventListener('click', e =>
    {
        let row = document.querySelector('#row' + selectedRowUid);
        let rowData = serializeRow(selectedRowUid);
        scheduleTemplates[selectedRowUid] = rowData;
        
        e.target.parentElement.parentElement.classList.remove('shown');
    });
    document.querySelector('#loadtemplatebutton').addEventListener('click', e =>
    {
        // Deserialization to an existing row only happens here
        let row = document.querySelector('#row' + selectedRowUid);
        let rowData = scheduleTemplates[selectedRowUid];
        if (!rowData)
            return;
        for (let iDay in rowData.days)
        {
            // Frickin type safety measures
            iDay = parseInt(iDay);
            let dayObj = row.querySelector('.day' + (iDay));
            let dayData = rowData.days[iDay];
            writeMainCell(dayObj, dayData);
        }
        
        e.target.parentElement.parentElement.classList.remove('shown');
    });
    document.querySelector('#deleterowbutton').addEventListener('click', e =>
    {
        e.target.parentElement.parentElement.classList.remove('shown');
        removeRow(selectedRowUid);
    });

    initializeSchedule();

    populateBlankSchedule();

    // By default, save the blank schedule for checking changes
    lastSavedSchedule = serializeSchedule();
});

window.onbeforeunload = function ()
{
    saveShownDays();

    // Only autosave schedule if it is different
    let currentSchedule = serializeSchedule();
    let date = new Date();
    // We format it ourselves to avoid excessive length
    let formattedDate = '(' + date.getMonth() + '/' + date.getDate() + '/' + date.getFullYear() + ' @ ' + date.getHours() + ':' + date.getMinutes() + ')'
    if (currentSchedule != lastSavedSchedule)
    {
        saveTemplates();
        if (autosavedSchedules.length >= MAX_AUTOSAVED_SCHEDULES)
            autosavedSchedules.shift(); // Remove the oldest schedule
        autosavedSchedules.push(
        {
            timestamp: formattedDate,
            schedule: currentSchedule
        });
        localStorage.setItem('autosavedSchedules', JSON.stringify(autosavedSchedules));
    }
};

function updateViewportSizeVars(e)
{
    document.documentElement.style.setProperty('--viewport-w',
        document.documentElement.clientWidth + 'px');
    document.documentElement.style.setProperty('--viewport-h',
        document.documentElement.clientHeight + 'px');
};

function initializeSchedule()
{
    // Reset vars
    rowUidCounter = 0;

    // Clear rows, if any exist
    for (let row of document.querySelectorAll('.row'))
    {
        row.remove();
    }

    // Add rows
    addHeaderRow();
    
    addAddRow().classList.add('addrow');
    // It's reasonable to assume that users will not create 10000 names
    setRowOrder(document.querySelector('.addrow').getAttribute('uid'), 10000);

    document.querySelector('.addbutton').addEventListener('click', addMainRow);
};

// This function will assume the schedule has been initialized already,
//  and will populate it with entries.
function populateBlankSchedule()
{
    // loadedScheduleTemplates is already in an iterable array form

    if (loadedScheduleTemplates == null)
        return;
    
    for (let rowData of loadedScheduleTemplates)
    {
        let row = deserializeRow(rowData);
        let rowUid = row.getAttribute('uid')
        console.log(rowUid);
        scheduleTemplates[rowUid] = rowData;
    }
};

// Column manipulation

function hideDay (i_day)
{
    let columnCells = document.getElementsByClassName('day' + i_day);
    shownDays[i_day] = false;
    
    for (let columnCell of columnCells)
    {
        columnCell.classList.add('hidden');
    }
};

function showDay (i_day)
{
    let columnCells = document.getElementsByClassName('day' + i_day);
    shownDays[i_day] = true;
    
    for (let columnCell of columnCells)
    {
        columnCell.classList.remove('hidden');
    }
};

// Row insertion

function addRow (makeFirstCell, makeMiddleCell)
{
    let newRow = document.createElement('Div');
    newRow.setAttribute('class', 'row');
    scheduleObject.appendChild(newRow);

    let rowContents = document.createElement('Div');
    rowContents.setAttribute('class', 'rowcontents');
    newRow.appendChild(rowContents);

    // Add columns
    let nameColumn = makeFirstCell();
    nameColumn.classList.add('cell');
    nameColumn.classList.add('namecol');
    rowContents.appendChild(nameColumn);

    for (let i = 0; i < 7; i++) {
        let dayColumn = makeMiddleCell(i);
        dayColumn.classList.add('cell');
        dayColumn.classList.add('daycol');
        dayColumn.classList.add('day'+i);
        if (!shownDays[i])
            dayColumn.classList.add('hidden');
        rowContents.appendChild(dayColumn);
    }

    let rowUid = rowUidCounter;
    rowUidCounter++;

    newRow.setAttribute('id', 'row' + rowUid); // For selection
    newRow.setAttribute('uid', rowUid); // For data reading
    setRowOrder(rowUid);

    // Add shadow row
    let shadowRow = document.createElement('Div');
    shadowRow.setAttribute('class', 'shadowrow');
    shadowRow.addEventListener('mouseup', e =>
    {
        let movingRows = document.getElementsByClassName('moving');
        let movedRowUid = movingRows[0].getAttribute('uid');
        let afterRowUid = rowUid;

        // Reset classes
        // There really shouldn't be more than one moving row at a time
        for (let movingRow of movingRows)
        {
            movingRow.classList.remove('moving');
        }
        let shadowRows = document.getElementsByClassName('shadowrow');
        for (let shadowRow of shadowRows)
        {
            shadowRow.classList.remove('shown');
        }

        moveRow(movedRowUid, afterRowUid);
    });
    newRow.appendChild(shadowRow);

    return newRow;
};

function addHeaderRow ()
{
    return addRow(function ()
    {
        let firstCell = document.createElement('Div');
        return firstCell;
    }, function (i)
    {
        const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursdsay','Friday','Saturday'];
        
        let middleCell = document.createElement('Div');
        middleCell.textContent = dayNames[i];
        return middleCell;
    });
};

function addAddRow ()
{
    return addRow(function ()
    {
        let firstCell = document.createElement('Div');

        let button = document.createElement('A');
        firstCell.appendChild(button);
        button.setAttribute('class', 'button addbutton');
        button.setAttribute('href', '#');
        
        return firstCell;
    }, function (i)
    {
        let middleCell = document.createElement('Div');
        return middleCell;
    });
};

function addMainRow ()
{
    let addedRow = addRow(function ()
    {
        // TODO: all event handling should be done here, upon initiation
        let firstCell = document.createElement('Div');
        
        let moveButton = document.createElement('A');
        moveButton.setAttribute('class', 'button movebutton');
        moveButton.setAttribute('href', '#');
        firstCell.appendChild(moveButton);

        let nameInput = document.createElement('Input');
        nameInput.addEventListener('input', e =>
        {
            updatePrintCell(firstCell);
        });
        firstCell.appendChild(nameInput);
        
        let extButton = document.createElement('A');
        extButton.setAttribute('class', 'button extbutton');
        extButton.setAttribute('href', '#');
        firstCell.appendChild(extButton);

        let printCell = document.createElement('Div');
        printCell.setAttribute('class', 'printcell');
        firstCell.appendChild(printCell);

        return firstCell;
    }, function (i)
    {
        let middleCell = document.createElement('Div');

        let input = document.createElement('Input');
        input.addEventListener('input', e =>
        {
            updatePrintCell(middleCell);
        });
        middleCell.appendChild(input);
        let datalist = document.createElement('Datalist');
        middleCell.appendChild(datalist);

        let printCell = document.createElement('Div');
        printCell.setAttribute('class', 'printcell');
        middleCell.appendChild(printCell);

        return middleCell;
    });

    // Add event handlers
    let nameCol = addedRow.querySelector('.namecol');
    let moveButton = nameCol.querySelector('.movebutton');
    let extButton = nameCol.querySelector('.extbutton');
    let rowUid = addedRow.getAttribute('uid');

    moveButton.addEventListener('mouseenter', function ()
    {
        hoveredRowUid = rowUid;
    });
    moveButton.addEventListener('mousedown', function ()
    {
        document.querySelector('#row' + rowUid).classList.add('moving');
        let shadowRows = document.getElementsByClassName('shadowrow');
        for (let shadowRow of shadowRows)
        {
            shadowRow.classList.add('shown');
        }
    });
    extButton.addEventListener('click', function ()
    {
        // TODO: this feels like it could be its own function
        let contextMenu = document.querySelector('#rowmenu').querySelector('.contextmenu');
        let extButtonRect = extButton.getBoundingClientRect();
        let toolbar = document.querySelector('.toolbar');
        let toolbarRect = toolbar.getBoundingClientRect();

        selectedRowUid = parseInt(addedRow.getAttribute('uid'));

        contextMenu.style.left = (extButtonRect.x - toolbarRect.x) + 'px';
        contextMenu.style.top = (extButtonRect.y - toolbarRect.y) + 'px';
        contextMenu.classList.add('shown');
    });

    // NOTE: It might be possible to do this during cell initialization
    for (let dayCol of addedRow.getElementsByClassName('daycol'))
    {
        let input = dayCol.children[0];
        // NOTE: this may need to be changed if we end up adding other classes
        let dayClass = dayCol.classList[2];
        let datalist = dayCol.children[1];
        let datalistId = rowUid + dayClass + 'list'

        input.setAttribute('list', datalistId);
        datalist.setAttribute('id', datalistId);

        input.addEventListener('focus', () =>
        {
            for (let time of timeTemplates)
            {
                let option = document.createElement('Option');
                datalist.appendChild(option);

                option.innerHTML = time;
            }
        });

        input.addEventListener('focusout', e =>
        {
            // Removal doesn't play nice with for...of loops
            for (let i = datalist.children.length; i > 0; i--)
            {
                datalist.children[0].remove();
            }
        });
    }

    return addedRow;
};

// Row manipulation

// These are the cells with .cell.namecol classes
function readNameCell (cell)
{
    return cell.children[1].value;
};

function writeNameCell (cell, value)
{
    cell.children[1].value = value;
    updatePrintCell(cell);
};

function updatePrintCell (cell) {
    let isNameCell = cell.classList.contains('namecol');

    if (isNameCell)
        cell.querySelector('.printcell').textContent = readNameCell(cell);
    else
        cell.querySelector('.printcell').textContent = readMainCell(cell);
};

// These are the cells with .cell.daycol classes
function readMainCell (cell)
{
    return cell.firstChild.value;
};

function writeMainCell (cell, value)
{
    cell.firstChild.value = value;
    updatePrintCell(cell);
};

function getCellDirty (cell)
{
    return cell.getAttribute('dirty') == 'true';
};

function removeRow (rowUid)
{
    let row = document.querySelector('#row' + rowUid)

    row.remove();
};

function setRowOrder (rowUid, order)
{
    // Default row order
    order = order || rowUid;
    let row = document.querySelector('#row' + rowUid);

    row.style.order = order;
};

function moveRow (movedUid, afterUid)
{
    // The addRow is never supposed to be moved
    // Hardcoded values are iffy, but this SHOULD be fine
    if (movedUid == 1 || afterUid == 1)
    {
        return;
    }
    // It is already where it needs to be
    if (movedUid == afterUid)
    {
        return;
    }

    let movedRow = document.querySelector('#row' + movedUid);
    let afterRow = document.querySelector('#row' + afterUid);

    let oldMovedOrder = parseInt(movedRow.style.order);
    // This will sort them to the same spot... but we have a check in place
    //  for this
    let afterOrder = parseInt(afterRow.style.order);
    // 'Forward,' in this case, means movement towards element 0
    let movingForward = afterOrder < oldMovedOrder;
    movedRow.style.order = afterOrder;

    // Get array of rows
    let rowArray = getOrderedRowArray();

    // Prepare for reordering
    rowArray.sort(function (a, b)
    {  
        // Force movedRow after afterRow
        if (a === movedRow && b === afterRow)
            return 1;
        else
            // Do not rely on implicit casts to int
            return parseInt(a.style.order) - parseInt(b.style.order);
    });

    // Find movedRow's index
    let i_movedRow;
    for (let i_row in rowArray)
    {
        // For some reason, the indices of rowArray begin as strings
        i_row = parseInt(i_row);
        let row = rowArray[i_row];
        if (row === movedRow)
        {
            i_movedRow = i_row;
            break;
        }
    }

    // Shift everything towards the back, moving the row forward.
    // We start directly with movedRow.
    if (movingForward)
    {
        for (let i = i_movedRow; i < rowArray.length - 1; i++)
        {
            let nextOrder = parseInt(rowArray[i + 1].style.order);
            
            // Convert to digits to facilitate comparison
    
            if (nextOrder < oldMovedOrder)
            {
                rowArray[i].style.order = nextOrder;
            } else
            {
                // Put the last element where the moved element was
                rowArray[i].style.order = oldMovedOrder;
                break;
            }
        }
    }
    // Shift everything towards the front, moving the row backward.
    // We start right before movedRow (the afterRow) and work our way toward the front.
    else
    {
        for (let i = i_movedRow; i > 0; i--)
        {
            let prevOrder = parseInt(rowArray[i - 1].style.order);
            
            if (prevOrder > oldMovedOrder)
            {
                rowArray[i].style.order = prevOrder;
            } else
            {
                // Put the last element where the moved element was
                rowArray[i].style.order = oldMovedOrder;
                break;
            }
        }
    }
};

function getOrderedRowArray()
{
    let rowsObject = document.getElementsByClassName('row');
    let rowArray = [];

    // Add the rows to the row array (this is an important step)
    for (let row of rowsObject)
    {
        rowArray.push(row);
    }

    rowArray.sort((a, b) =>
    {
        return parseInt(a.style.order) - parseInt(b.style.order);
    })

    return rowArray;
};

// Data serialization

function serializeRow(rowUid)
{
    let row = document.querySelector('#row' + rowUid);
    let rowData = {};

    let nameCol = row.querySelector('.namecol');
    rowData.name = readNameCell(nameCol);

    rowData.days = [];
    let dayCols = row.getElementsByClassName('daycol');
    for (let dayCol of dayCols)
    {
        rowData.days.push(readMainCell(dayCol));
    }

    return rowData;
};

function deserializeRow(rowData)
{
    let row = addMainRow();

    let nameCol = row.querySelector('.namecol');
    writeNameCell(nameCol, rowData.name);

    for (let iDay in rowData.days)
    {
        dayData = rowData.days[iDay];
        
        if (dayData)
        {
            let dayObj = row.querySelector('.day' + iDay);
            writeMainCell(dayObj, dayData);
        }
    }

    return row;
};

function serializeSchedule()
{
    // Get array of rows
    let rowArray = getOrderedRowArray();
    let serializedRows = [];

    for (let row of rowArray)
    {
        let rowUid = parseInt(row.getAttribute('uid'));

        // Skip the header row and addRow; those are the same every time and
        //  do not need to be saved
        if (rowUid > 1)
        {
            serializedRows.push(serializeRow(rowUid));
        }
    }

    return serializedRows;
};

// Time templates exist as data, not an element on the schedule,
//  and therefore do not need to be serialized.

// NOTE: This will simply populate the schedule with values from localStorage.
//  It will do this whether rows already exist or not; checking for that is
//  outside the scope of deserialization.
function loadSchedule (scheduleData)
{
    if (scheduleData == null)
        return;
    
    for (let row of scheduleData)
    {
        deserializeRow(row);
    }
};

function saveTemplates ()
{
    let rowArray = getOrderedRowArray();
    let serializedTemplates = []

    for (let row of rowArray)
    {
        let rowUid = parseInt(row.getAttribute('uid'));

        // Skip non-schedule rows
        if (rowUid > 1)
        {
            let rowName = readNameCell(row.querySelector('.namecol'));
            // Use applicable template, or a blank one
            if (scheduleTemplates[rowUid])
            {
                let template = scheduleTemplates[rowUid];
                template.name = rowName; // Use current name, always
                serializedTemplates.push(template);
            }
            else
            {
                let template = serializeRow(rowUid);
                template.days.forEach((element, i_element, dayArray) =>
                {
                    dayArray[i_element] = '';
                })
                serializedTemplates.push(template);
            }
        }
    }

    localStorage.setItem('timeTemplates', JSON.stringify(timeTemplates));
    localStorage.setItem('templates', JSON.stringify(serializedTemplates));
};

// NOTE: Templates are very closely coupled with their rows now, since this
//  will allow people to have the same name and will make blank-row templates
//  fine.
function loadTemplates ()
{
    let templateData = JSON.parse(localStorage.getItem('templates')) || [];
    
    loadedScheduleTemplates = [];
    scheduleTemplates = {};
    for (let rowData of templateData)
    {
        loadedScheduleTemplates.push(rowData)
    }

    timeTemplates = JSON.parse(localStorage.getItem('timeTemplates'));
};

function saveShownDays ()
{
    localStorage.setItem('shownDays', JSON.stringify(shownDays));
};

// TODO: Quite a few of the loading functions now double as initialization
// functions when no saved data exists, and this may be bad practice, but I don't care
function loadShownDays ()
{
    let shownDaysData = JSON.parse(localStorage.getItem('shownDays'));

    // Default all true
    if (!shownDaysData)
    {
        for (let i = 0; i < 7; i++)
        {
            showDay(i);
        }
    }
    else
    {
        // I don't like the foreach function
        for (let i = 0; i < 7; i++)
        {
            let isShown = shownDaysData[i];
            if (isShown)
                showDay(i);
            else
                hideDay(i);
        }
    }
};
