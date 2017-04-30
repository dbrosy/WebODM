import '../css/EditTaskForm.scss';
import React from 'react';
import ProcessingNodeOption from './ProcessingNodeOption';
import values from 'object.values';
import Utils from '../classes/Utils';

if (!Object.values) {
    values.shim();
}

class EditTaskForm extends React.Component {
  static defaultProps = {
    selectedNode: null,
    task: null
  };

  static propTypes = {
      selectedNode: React.PropTypes.oneOfType([
        React.PropTypes.string,
        React.PropTypes.number
      ]),
      onFormLoaded: React.PropTypes.func,
      task: React.PropTypes.object
  };

  constructor(props){
    super(props);

    this.namePlaceholder = "Task of " + (new Date()).toISOString();

    this.state = {
      error: "",
      name: props.task !== null ? (props.task.name || "") : "",
      advancedOptions: props.task !== null ? props.task.options.length > 0 : false,
      loadedProcessingNodes: false,
      selectedNode: null,
      processingNodes: []
    };

    // Refs to ProcessingNodeOption components
    this.options = {};

    this.handleNameChange = this.handleNameChange.bind(this);
    this.setAdvancedOptions = this.setAdvancedOptions.bind(this);
    this.handleSelectNode = this.handleSelectNode.bind(this);
    this.setOptionRef = this.setOptionRef.bind(this);
    this.loadProcessingNodes = this.loadProcessingNodes.bind(this);
    this.retryLoadProcessingNodes = this.retryLoadProcessingNodes.bind(this);
    this.selectNodeByKey = this.selectNodeByKey.bind(this);
    this.getTaskInfo = this.getTaskInfo.bind(this);
  }

  loadProcessingNodes(){
    function failed(){
      // Try again
      setTimeout(loadProcessingNodes, 1000);
    }

    this.nodesRequest = 
      $.getJSON("/api/processingnodes/?has_available_options=True", json => {
        if (Array.isArray(json)){
          // No nodes with options?
          const noProcessingNodesError = (nodes) => {
            var extra = nodes ? "We tried to reach:<ul>" + nodes.map(n => Utils.html`<li><a href="${n.url}">${n.label}</a></li>`).join("") + "</ul>" : "";
            this.setState({error: `There are no usable processing nodes. ${extra}Make sure that at least one processing node is reachable and
             that you have granted the current user sufficient permissions to view 
             the processing node (by going to Administration -- Processing Nodes -- Select Node -- Object Permissions -- Add User/Group and check CAN VIEW PROCESSING NODE).
             If you are bringing a node back online, it will take about 30 seconds for WebODM to recognize it.`});
          };

          if (json.length === 0){
            noProcessingNodesError();
            return;
          }

          let now = new Date();

          let nodes = json.map(node => {
            return {
              id: node.id,
              key: node.id,
              label: `${node.hostname}:${node.port} (queue: ${node.queue_count})`,
              options: node.available_options,
              queue_count: node.queue_count,
              enabled: node.online,
              url: `http://${node.hostname}:${node.port}`
            };
          });

          let autoNode = null;

          // If the user has selected auto, and a processing node has been assigned
          // we need attempt to find the "auto" node to be the one that has been assigned
          if (this.props.task && this.props.task.processing_node && this.props.task.auto_processing_node){
            autoNode = nodes.find(node => node.id === this.props.task.processing_node);
          }

          if (!autoNode){
            // Find a node with lowest queue count
            let minQueueCount = Math.min(...nodes.filter(node => node.enabled).map(node => node.queue_count));
            let minQueueCountNodes = nodes.filter(node => node.enabled && node.queue_count === minQueueCount);

            if (minQueueCountNodes.length === 0){
              noProcessingNodesError(nodes);
              return;
            }

            // Choose at random
            autoNode = minQueueCountNodes[~~(Math.random() * minQueueCountNodes.length)];
          }

          nodes.unshift({
            id: autoNode.id,
            key: "auto",
            label: "Auto",
            options: autoNode.options,
            enabled: true
          });

          this.setState({
            processingNodes: nodes,
            loadedProcessingNodes: true
          });

          // Have we specified a node?
          if (this.props.task && this.props.task.processing_node){
            if (this.props.task.auto_processing_node){
              this.selectNodeByKey("auto");
            }else{
              this.selectNodeByKey(this.props.task.processing_node);
            }
          }else{
            this.selectNodeByKey("auto");
          }

          if (this.props.onFormLoaded) this.props.onFormLoaded();
        }else{
          console.error("Got invalid json response for processing nodes", json);
          failed();
        }
      })
      .fail((jqXHR, textStatus, errorThrown) => {
        // I don't expect this to fail, unless it's a development error or connection error.
        // in which case we don't need to notify the user directly. 
        console.error("Error retrieving processing nodes", jqXHR, textStatus);
        failed();
      });
  }

  retryLoadProcessingNodes(){
    this.setState({error: ""});
    this.loadProcessingNodes();
  }

  componentDidMount(){
    this.loadProcessingNodes();
  }

  componentWillUnmount(){
      this.nodesRequest.abort();
  }

  handleNameChange(e){
    this.setState({name: e.target.value});
  }

  selectNodeByKey(key){
    let node = this.state.processingNodes.find(node => node.key == key);
    if (node) this.setState({selectedNode: node});
  }

  handleSelectNode(e){
    this.options = {};
    this.selectNodeByKey(e.target.value);
  }

  setAdvancedOptions(flag){
    return () => {
      this.setState({advancedOptions: flag});
    };
  }

  setOptionRef(optionName){
    return (component) => {
      if (component) this.options[optionName] = component;
    }
  }

  getOptions(){
    if (!this.state.advancedOptions) return [];
    else return Object.values(this.options)
      .map(option => {
        return {
          name: option.props.name,
          value: option.getValue()
        };
      })
      .filter(option => option.value !== undefined);
  }

  getTaskInfo(){
    return {
      name: this.state.name !== "" ? this.state.name : this.namePlaceholder,
      selectedNode: this.state.selectedNode,
      options: this.getOptions()
    };
  }

  // Takes a list of options, a task which could have options specified,
  // and changes the value options to use those of the task and set
  // a defaultValue key for all options.
  populateOptionsWithDefaultValues(options, task){
    options.forEach(opt => {
      if (!opt.defaultValue){
        let taskOpt;
        if (task && Array.isArray(task.options)){
          taskOpt = task.options.find(to => to.name == opt.name);
        }

        if (taskOpt){
          opt.defaultValue = opt.value;
          opt.value = taskOpt.value;
        }else{
          opt.defaultValue = opt.value !== undefined ? opt.value : "";
          delete(opt.value);
        }
      }
    });

    return options;
  }

  render() {
    if (this.state.error){
      return (<div className="edit-task-panel">
          <div className="alert alert-warning">
              <div dangerouslySetInnerHTML={{__html:this.state.error}}></div>
              <button className="btn btn-sm btn-primary" onClick={this.retryLoadProcessingNodes}>
                <i className="fa fa-rotate-left"></i> Retry
              </button>
          </div>
        </div>);
    }

    let processingNodesOptions = "";
    if (this.state.loadedProcessingNodes && this.state.selectedNode){
      let options = this.populateOptionsWithDefaultValues(this.state.selectedNode.options, this.props.task);

      processingNodesOptions = (
        <div>
          <div className="form-group">
            <label className="col-sm-2 control-label">Processing Node</label>
              <div className="col-sm-10">
                <select className="form-control" value={this.state.selectedNode.key} onChange={this.handleSelectNode}>
                {this.state.processingNodes.map(node => 
                  <option value={node.key} key={node.key} disabled={!node.enabled}>{node.label}</option>
                )}
                </select>
              </div>
          </div>
          <div className="form-group">
            <label className="col-sm-2 control-label">Options</label>
            <div className="col-sm-10">
              <div className="btn-group" role="group">
                <button type="button" className={"btn " + (!this.state.advancedOptions ? "btn-default" : "btn-secondary")} onClick={this.setAdvancedOptions(false)}>Use Defaults</button>
                <button type="button" className={"btn " + (this.state.advancedOptions ? "btn-default" : "btn-secondary")} onClick={this.setAdvancedOptions(true)}>Set Options</button>
              </div>
            </div>
          </div>
          <div className={"form-group " + (!this.state.advancedOptions ? "hide" : "")}>
            <div className="col-sm-offset-2 col-sm-10">
              {options.map(option =>
                <ProcessingNodeOption {...option}
                  key={option.name}
                  ref={this.setOptionRef(option.name)} /> 
              )}
            </div>
          </div>
        </div>
        );
    }else{
      processingNodesOptions = (<div className="form-group">
          <div className="col-sm-offset-2 col-sm-10">Loading processing nodes... <i className="fa fa-refresh fa-spin fa-fw"></i></div>
        </div>);
    }

    return (
      <div className="edit-task-form">
        <div className="form-group">
          <label className="col-sm-2 control-label">Name</label>
          <div className="col-sm-10">
            <input type="text" 
              onChange={this.handleNameChange} 
              className="form-control" 
              placeholder={this.namePlaceholder} 
              value={this.state.name} 
            />
          </div>
        </div>
        {processingNodesOptions}
      </div>
    );
  }
}

export default EditTaskForm;
